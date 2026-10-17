package com.internyay.controller;

import com.internyay.dto.HearingLimitRequest;
import com.internyay.dto.HearingLimitsDto;
import com.internyay.service.HearingDayService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

// How many hearings the advocate takes on a day: a usual limit and a limit for particular dates
@RestController
@RequestMapping("/api/hearing-limits")
@RequiredArgsConstructor
public class HearingLimitController {

    private final HearingDayService hearingDays;
    private final AuthHelper auth;

    // The usual limit and the limits of particular dates
    @GetMapping
    public ResponseEntity<HearingLimitsDto> get() {
        return ResponseEntity.ok(hearingDays.limits(auth.currentUserId()));
    }

    // Change the usual limit, an empty limit removes it
    @PutMapping("/default")
    public ResponseEntity<HearingLimitsDto> setDefault(@RequestBody HearingLimitRequest req) {
        hearingDays.setDefaultLimit(req.getLimit(), auth.currentUserId());
        return ResponseEntity.ok(hearingDays.limits(auth.currentUserId()));
    }

    // Change the limit of one date
    @PutMapping("/{date}")
    public ResponseEntity<HearingLimitsDto> setForDate(
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestBody HearingLimitRequest req) {
        hearingDays.setDateLimit(date, req.getLimit(), auth.currentUserId());
        return ResponseEntity.ok(hearingDays.limits(auth.currentUserId()));
    }

    // Go back to the usual limit for one date
    @DeleteMapping("/{date}")
    public ResponseEntity<HearingLimitsDto> resetDate(
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        hearingDays.resetDateLimit(date, auth.currentUserId());
        return ResponseEntity.ok(hearingDays.limits(auth.currentUserId()));
    }
}
