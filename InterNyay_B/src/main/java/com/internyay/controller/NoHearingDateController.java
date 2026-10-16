package com.internyay.controller;

import com.internyay.dto.NoHearingDateRequest;
import com.internyay.service.HearingDayService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

// Days the advocate marked as having no hearings
@RestController
@RequestMapping("/api/no-hearing-dates")
@RequiredArgsConstructor
public class NoHearingDateController {

    private final HearingDayService hearingDays;
    private final AuthHelper auth;

    // Marked dates
    @GetMapping
    public ResponseEntity<List<LocalDate>> list() {
        return ResponseEntity.ok(hearingDays.list(auth.currentUserId()));
    }

    // Mark a date
    @PostMapping
    public ResponseEntity<LocalDate> mark(@RequestBody NoHearingDateRequest req) {
        return ResponseEntity.ok(hearingDays.mark(req.getDate(), auth.currentUserId()));
    }

    // Unmark a date
    @DeleteMapping("/{date}")
    public ResponseEntity<Void> unmark(
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        hearingDays.unmark(date, auth.currentUserId());
        return ResponseEntity.noContent().build();
    }
}
