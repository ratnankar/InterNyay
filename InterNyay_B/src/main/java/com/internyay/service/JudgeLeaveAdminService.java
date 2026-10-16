package com.internyay.service;

import com.internyay.dto.AdminJudgeLeaveDto;
import com.internyay.dto.JudgeLeaveRequest;
import com.internyay.entity.Court;
import com.internyay.entity.JudgeOnLeave;
import com.internyay.repository.JudgeOnLeaveRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.NoSuchElementException;

// Admin view and manual edits of the judges on leave data
@Service
@RequiredArgsConstructor
public class JudgeLeaveAdminService {

    private final JudgeOnLeaveRepository repo;
    private final CourtService courtService;

    // Filter by court, district, status and a search word, defaults to active entries
    @Transactional(readOnly = true)
    public List<AdminJudgeLeaveDto> list(String court, String district, String status, String q, int limit) {

        LocalDate today = LocalDate.now();
        String wanted = (status == null || status.isBlank()) ? "ACTIVE" : status.trim().toUpperCase();
        String needle = (q == null || q.isBlank()) ? null : q.trim().toLowerCase();

        return repo.findAllForAdmin(blankToNull(court), blankToNull(district)).stream()
                .filter(j -> matchesStatus(AdminJudgeLeaveDto.statusOf(j, today), wanted))
                .filter(j -> needle == null
                        || contains(j.getName(), needle)
                        || contains(j.getReason(), needle))
                .limit(Math.max(1, Math.min(limit, 1000)))
                .map(j -> AdminJudgeLeaveDto.from(j, today))
                .toList();
    }

    // ALL, CURRENT, UPCOMING or past by the entry's computed status
    private static boolean matchesStatus(String actual, String wanted) {
        return switch (wanted) {
            case "ALL"      -> true;
            case "CURRENT"  -> actual.equals("CURRENT");
            case "UPCOMING" -> actual.equals("UPCOMING");
            case "PAST"     -> actual.equals("PAST");
            default         -> !actual.equals("PAST");
        };
    }

    // Manual entry, the end date can't be before the start
    @Transactional
    public AdminJudgeLeaveDto create(JudgeLeaveRequest req) {

        checkDates(req);

        String name = req.getName().trim();
        // Court and district must be in the court table; they are stored in the table's spelling
        Court place = courtService.placeOf(req.getCourt(), req.getDistrict());
        String court = place.getCourt();
        String district = place.getDistrict();

        if (repo.findFirstByNameAndCourtAndDistrictAndLeaveFromAndLeaveTo(
                name, court, district, req.getLeaveFrom(), req.getLeaveTo()).isPresent()) {
            throw new IllegalArgumentException(
                    "This leave is already listed for " + name + " — edit that entry instead");
        }

        JudgeOnLeave j = JudgeOnLeave.builder()
                .name(name)
                .court(court)
                .district(district)
                .leaveFrom(req.getLeaveFrom())
                .leaveTo(req.getLeaveTo())
                .reason(blankToNull(req.getReason()))
                .source(JudgeOnLeave.SOURCE_MANUAL)
                .build();

        return dto(repo.save(j));
    }

    // Only manual entries can be edited
    @Transactional
    public AdminJudgeLeaveDto update(Long id, JudgeLeaveRequest req) {

        JudgeOnLeave j = find(id);

        if (!j.isManual()) {
            throw new IllegalArgumentException(
                    "This leave is collected automatically from the court website and cannot be edited — hide it instead");
        }

        checkDates(req);

        String name = req.getName().trim();
        Court place = courtService.placeOf(req.getCourt(), req.getDistrict());
        String court = place.getCourt();
        String district = place.getDistrict();

        repo.findFirstByNameAndCourtAndDistrictAndLeaveFromAndLeaveTo(
                        name, court, district, req.getLeaveFrom(), req.getLeaveTo())
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> {
                    throw new IllegalArgumentException(
                            "This leave is already listed for " + name + " — edit that entry instead");
                });

        j.setName(name);
        j.setCourt(court);
        j.setDistrict(district);
        j.setLeaveFrom(req.getLeaveFrom());
        j.setLeaveTo(req.getLeaveTo());
        j.setReason(blankToNull(req.getReason()));
        j.setUpdatedAt(java.time.LocalDateTime.now());

        return dto(repo.save(j));
    }

    // Only manual entries can be deleted, scraped ones can be hidden instead
    @Transactional
    public void delete(Long id) {

        JudgeOnLeave j = find(id);

        if (!j.isManual()) {
            throw new IllegalArgumentException(
                    "This leave is collected automatically from the court website and would be "
                            + "added again at the next refresh — hide it instead of deleting it");
        }

        repo.delete(j);
    }

    // Hide an entry from advocates without losing it
    @Transactional
    public AdminJudgeLeaveDto setHidden(Long id, boolean hidden) {

        JudgeOnLeave j = find(id);
        j.setHiddenByAdmin(hidden);
        j.setUpdatedAt(java.time.LocalDateTime.now());

        return dto(repo.save(j));
    }

    // Entry by id or 404
    private JudgeOnLeave find(Long id) {
        return repo.findById(id).orElseThrow(() -> new NoSuchElementException("Leave entry not found"));
    }

    // Convert with today's date to get the status
    private static AdminJudgeLeaveDto dto(JudgeOnLeave j) {
        return AdminJudgeLeaveDto.from(j, LocalDate.now());
    }

    // End date must not be before the start date
    private static void checkDates(JudgeLeaveRequest req) {
        if (req.getLeaveTo().isBefore(req.getLeaveFrom())) {
            throw new IllegalArgumentException("The leave end date cannot be before the start date");
        }
    }

    // Case insensitive contains
    private static boolean contains(String haystack, String needleLower) {
        return haystack != null && haystack.toLowerCase().contains(needleLower);
    }

    // Empty becomes null
    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}