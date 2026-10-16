package com.internyay.controller;

import com.internyay.dto.HolidayDto;
import com.internyay.dto.HolidayRequest;
import com.internyay.entity.Holiday;
import com.internyay.repository.HolidayRepository;
import com.internyay.util.HolidayCourts;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;

// Court holidays shown on the calendar
@RestController
@RequestMapping("/api/holidays")
@RequiredArgsConstructor
public class HolidayController {

    private final HolidayRepository holidayRepo;

    // All holidays by date
    @GetMapping
    public ResponseEntity<List<HolidayDto>> list() {
        return ResponseEntity.ok(
                holidayRepo.findAllByOrderByDateAsc().stream().map(HolidayDto::from).toList());
    }

    // Admin: add a holiday, one per date
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<HolidayDto> create(@RequestBody HolidayRequest req) {

        // Date and label are required, and a date can only have one holiday
        if (req.getDate() == null)                          throw new IllegalArgumentException("Date is required");
        if (req.getLabel() == null || req.getLabel().isBlank())
            throw new IllegalArgumentException("Label is required");
        if (holidayRepo.existsByDate(req.getDate()))
            throw new IllegalArgumentException("A holiday is already set for that date");

        Holiday holiday = Holiday.builder()
                .date(req.getDate())
                .label(req.getLabel())
                .description(req.getDescription())
                .courtType(req.getCourtType() == null || req.getCourtType().isBlank()
                        ? HolidayCourts.BOTH
                        : HolidayCourts.canonical(req.getCourtType()))
                .build();

        return ResponseEntity.ok(HolidayDto.from(holidayRepo.save(holiday)));
    }

    // Admin: edit only the fields that were sent
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<HolidayDto> update(@PathVariable Long id, @RequestBody HolidayRequest req) {

        Holiday holiday = holidayRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Holiday not found"));

        // Only overwrite what the request actually contains
        if (req.getDate() != null)        holiday.setDate(req.getDate());
        if (req.getLabel() != null && !req.getLabel().isBlank()) holiday.setLabel(req.getLabel());
        if (req.getDescription() != null) holiday.setDescription(req.getDescription());
        if (req.getCourtType() != null)   holiday.setCourtType(HolidayCourts.canonical(req.getCourtType()));

        return ResponseEntity.ok(HolidayDto.from(holidayRepo.save(holiday)));
    }

    // Admin: delete a holiday
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!holidayRepo.existsById(id)) {
            throw new NoSuchElementException("Holiday not found");
        }
        holidayRepo.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
