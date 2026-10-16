package com.internyay.service;

import com.internyay.dto.BailRosterDto;
import com.internyay.dto.BailRosterRequest;
import com.internyay.entity.BailRosterEntry;
import com.internyay.entity.Judge;
import com.internyay.entity.BailRosterJudge;
import com.internyay.repository.BailRosterJudgeRepository;
import com.internyay.repository.BailRosterRepository;
import com.internyay.repository.JudgeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.stream.Collectors;

// CRUD for the bail roster, entries are managed by admin
@Service
@RequiredArgsConstructor
public class BailRosterService {

    private final CourtService courtService;

    private final BailRosterRepository bailRosterRepo;
    private final BailRosterJudgeRepository rosterJudgeRepo;
    private final JudgeRepository judgeRepo;

    // Optional court / district filters
    public List<BailRosterDto> list(String court, String district) {
        return toDtos(bailRosterRepo.findByFilters(blankToNull(court), blankToNull(district)));
    }

    // Entry by id or 404
    public BailRosterEntry get(Long id) {
        return bailRosterRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Bail roster entry not found"));
    }

    // New entry stamped with its creation time
    @Transactional
    public BailRosterDto create(BailRosterRequest req) {
        BailRosterEntry entry = new BailRosterEntry();
        entry.setCreatedAt(LocalDateTime.now());
        applyDetails(entry, req);
        BailRosterEntry saved = bailRosterRepo.save(entry);
        syncJudgeLinks(saved);
        return toDtos(List.of(saved)).get(0);
    }

    // Edit an entry and stamp the update time
    @Transactional
    public BailRosterDto update(Long id, BailRosterRequest req) {
        BailRosterEntry entry = get(id);
        applyDetails(entry, req);
        entry.setUpdatedAt(LocalDateTime.now());
        BailRosterEntry saved = bailRosterRepo.save(entry);
        syncJudgeLinks(saved);
        return toDtos(List.of(saved)).get(0);
    }

    // Removes a roster entry and its judge links
    @Transactional
    public void delete(Long id) {
        BailRosterEntry entry = get(id);
        rosterJudgeRepo.deleteByRosterId(entry.getId());
        bailRosterRepo.delete(entry);
    }

    // Keeps the bail_roster_judges table equal to the officer ids saved on the entry
    private void syncJudgeLinks(BailRosterEntry entry) {
        rosterJudgeRepo.deleteByRosterId(entry.getId());
        rosterJudgeRepo.flush();
        Set<Long> ids = new LinkedHashSet<>(BailRosterDto.idsOf(entry.getJudicialOfficerIds()));
        rosterJudgeRepo.saveAll(ids.stream()
                .map(j -> BailRosterJudge.builder().rosterId(entry.getId()).judgeId(j).build())
                .toList());
    }

    // Resolve all judge ids in one go instead of one lookup per row
    private List<BailRosterDto> toDtos(List<BailRosterEntry> entries) {
        Set<Long> ids = new LinkedHashSet<>();
        for (BailRosterEntry e : entries) {
            ids.addAll(BailRosterDto.idsOf(e.getJudicialOfficerIds()));
            if (e.getLinkOneJudgeId() != null) ids.add(e.getLinkOneJudgeId());
            if (e.getLinkTwoJudgeId() != null) ids.add(e.getLinkTwoJudgeId());
        }

        Map<Long, Judge> judges = ids.isEmpty()
                ? new HashMap<>()
                : judgeRepo.findAllById(ids).stream().collect(Collectors.toMap(Judge::getId, j -> j));

        return entries.stream().map(e -> BailRosterDto.from(e, judges)).toList();
    }

    // Copy request fields onto the entry, the district decides the court
    private void applyDetails(BailRosterEntry entry, BailRosterRequest req) {
        String canonicalDistrict = courtService.requireDistrict(req.getDistrict());
        entry.setDistrict(canonicalDistrict);
        entry.setCourt(courtService.courtOf(canonicalDistrict).orElse(req.getCourt().trim()));
        entry.setPoliceStationAgencies(blankToNull(req.getPoliceStationAgencies()));

        if (req.getIssuedOn() != null) {
            entry.setIssuedOn(req.getIssuedOn());
        } else if (entry.getIssuedOn() == null) {
            entry.setIssuedOn(LocalDate.now());
        }

        if (req.getLinkOneJudgeId() != null && req.getLinkOneJudgeId().equals(req.getLinkTwoJudgeId())) {
            throw new IllegalArgumentException("Link 1 and Link 2 must be two different judicial officers");
        }

        Set<Long> officerIds = new LinkedHashSet<>();
        if (req.getJudicialOfficerIds() != null) {
            req.getJudicialOfficerIds().stream().filter(x -> x != null).forEach(officerIds::add);
        }

        if (officerIds.isEmpty() && req.getLinkOneJudgeId() == null && req.getLinkTwoJudgeId() == null) {
            throw new IllegalArgumentException("Select at least one judicial officer from the Judges List");
        }

        Set<Long> lookupIds = new LinkedHashSet<>(officerIds);
        if (req.getLinkOneJudgeId() != null) lookupIds.add(req.getLinkOneJudgeId());
        if (req.getLinkTwoJudgeId() != null) lookupIds.add(req.getLinkTwoJudgeId());

        Map<Long, Judge> judges = lookupIds.isEmpty()
                ? Map.of()
                : judgeRepo.findAllById(lookupIds).stream().collect(Collectors.toMap(Judge::getId, j -> j));

        List<String> names = new ArrayList<>();
        for (Long id : officerIds) {
            Judge judge = judges.get(id);
            if (judge == null) {
                throw new NoSuchElementException("Judge not found in the Judges List");
            }
            names.add(judge.getName());
        }
        if (req.getLinkOneJudgeId() != null && judges.get(req.getLinkOneJudgeId()) == null) {
            throw new NoSuchElementException("Judge not found in the Judges List");
        }
        if (req.getLinkTwoJudgeId() != null && judges.get(req.getLinkTwoJudgeId()) == null) {
            throw new NoSuchElementException("Judge not found in the Judges List");
        }

        entry.setJudicialOfficerIds(officerIds.stream().map(String::valueOf).collect(Collectors.joining(",")));
        entry.setJudicialOfficers(String.join("\n", names));
        entry.setLinkOneJudgeId(req.getLinkOneJudgeId());
        entry.setLinkTwoJudgeId(req.getLinkTwoJudgeId());

        applyValidity(entry, req);
    }

    // Roster validity: from date, and either an end date or "until further order"
    private void applyValidity(BailRosterEntry entry, BailRosterRequest req) {
        entry.setFromDate(req.getFromDate());
        entry.setFurtherOrder(req.isFurtherOrder());

        if (req.isFurtherOrder()) {
            entry.setTillDate(null);
            return;
        }

        if (req.getFromDate() != null && req.getTillDate() != null
                && req.getTillDate().isBefore(req.getFromDate())) {
            throw new IllegalArgumentException("Till date cannot be before the from date");
        }
        entry.setTillDate(req.getTillDate());
    }

    // Empty strings become null
    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
