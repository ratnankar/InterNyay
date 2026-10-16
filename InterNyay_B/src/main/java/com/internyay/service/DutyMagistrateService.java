package com.internyay.service;

import com.internyay.dto.DutyMagistrateRequest;
import com.internyay.entity.DutyMagistrate;
import com.internyay.entity.Judge;
import com.internyay.repository.DutyMagistrateRepository;
import com.internyay.repository.JudgeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.TreeSet;
import java.util.stream.Collectors;

// Duty magistrate roster, each entry points to a judge in the Judges List
@Service
@RequiredArgsConstructor
public class DutyMagistrateService {

    private final DutyMagistrateRepository dutyMagistrateRepo;
    private final JudgeRepository judgeRepo;

    // Optional court / district filters
    public List<DutyMagistrate> list(String court, String district) {
        return dutyMagistrateRepo.findByFilters(blankToNull(court), blankToNull(district));
    }

    // Entry by id or 404
    public DutyMagistrate get(Long id) {
        return dutyMagistrateRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Duty magistrate entry not found"));
    }

    // New entry
    public DutyMagistrate create(DutyMagistrateRequest req) {
        DutyMagistrate entry = new DutyMagistrate();
        entry.setCreatedAt(LocalDateTime.now());
        applyDetails(entry, req);
        return dutyMagistrateRepo.save(entry);
    }

    // Edit an entry
    public DutyMagistrate update(Long id, DutyMagistrateRequest req) {
        DutyMagistrate entry = get(id);
        applyDetails(entry, req);
        entry.setUpdatedAt(LocalDateTime.now());
        return dutyMagistrateRepo.save(entry);
    }

    // Delete an entry
    public void delete(Long id) {
        dutyMagistrateRepo.delete(get(id));
    }

    // Judge fields are copied from the Judges List row
    private void applyDetails(DutyMagistrate entry, DutyMagistrateRequest req) {
        Judge judge = judgeRepo.findById(req.getJudgeId())
                .orElseThrow(() -> new NoSuchElementException("Judge not found in the Judges List"));
        entry.applyJudge(judge);

        TreeSet<LocalDate> working = parseDates(req.getWorkingDay(), "working day");
        TreeSet<LocalDate> holidays = parseDates(req.getHoliday(), "holiday");

        for (LocalDate d : working) {
            if (holidays.contains(d)) {
                throw new IllegalArgumentException(d + " is listed as both a working day and a holiday");
            }
        }

        if (req.getIssuedOn() != null) {
            entry.setIssuedOn(req.getIssuedOn());
        } else if (entry.getIssuedOn() == null) {
            entry.setIssuedOn(LocalDate.now());
        }

        entry.setWorkingDay(join(working));
        entry.setHoliday(join(holidays));

        applyValidity(entry, req);
    }

    // Roster validity: from date, and either an end date or "until further order"
    private void applyValidity(DutyMagistrate entry, DutyMagistrateRequest req) {
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

    // Comma separated dates, sorted and without duplicates
    private TreeSet<LocalDate> parseDates(String csv, String what) {
        TreeSet<LocalDate> dates = new TreeSet<>();
        if (csv == null || csv.isBlank()) return dates;

        for (String token : csv.split(",")) {
            String t = token.trim();
            if (t.isEmpty()) continue;
            try {
                dates.add(LocalDate.parse(t));
            } catch (DateTimeParseException ex) {
                throw new IllegalArgumentException("Invalid " + what + " date: " + t);
            }
        }
        return dates;
    }

    // Dates back to a comma separated string
    private String join(TreeSet<LocalDate> dates) {
        return dates.isEmpty()
                ? null
                : dates.stream().map(LocalDate::toString).collect(Collectors.joining(","));
    }

    // Empty becomes null
    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
