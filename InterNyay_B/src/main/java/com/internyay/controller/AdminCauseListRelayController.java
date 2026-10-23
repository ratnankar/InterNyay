package com.internyay.controller;

import com.internyay.dto.CauseListRelayAnswer;
import com.internyay.dto.CauseListRelayStep;
import com.internyay.service.CauseListService;
import com.internyay.service.DistrictCauseListRelayService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/admin/cause-list-relay")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminCauseListRelayController {

    private final DistrictCauseListRelayService service;
    private final CauseListService causeListService;

    @PostMapping("/start")
    public ResponseEntity<CauseListRelayStep> start(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(service.start(date));
    }

    // Fetches the Delhi High Court PDF and eCourts API numbers again for the chosen date,
    // replacing numbers already saved (district courts still go through the CAPTCHA relay above)
    @PostMapping("/refresh-date")
    public ResponseEntity<CauseListService.Result> refreshDate(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(causeListService.fetchFor(date));
    }

    @PostMapping("/{sessionId}/answer")
    public ResponseEntity<CauseListRelayStep> answer(
            @PathVariable String sessionId, @Valid @RequestBody CauseListRelayAnswer body) {
        return ResponseEntity.ok(service.answer(sessionId, body.captcha()));
    }

    @PostMapping("/{sessionId}/skip")
    public ResponseEntity<CauseListRelayStep> skip(@PathVariable String sessionId) {
        return ResponseEntity.ok(service.skip(sessionId));
    }

    @PostMapping("/{sessionId}/refresh")
    public ResponseEntity<CauseListRelayStep> refresh(@PathVariable String sessionId) {
        return ResponseEntity.ok(service.refresh(sessionId));
    }
}
