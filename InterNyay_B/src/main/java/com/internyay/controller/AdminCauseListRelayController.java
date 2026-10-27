package com.internyay.controller;

import com.internyay.dto.CauseListRelayAnswer;
import com.internyay.dto.CauseListRelayStep;
import com.internyay.dto.CauseListRunDto;
import com.internyay.dto.CauseListScheduleDto;
import com.internyay.service.CauseListAutoRunService;
import com.internyay.service.CauseListRunLogService;
import com.internyay.service.CauseListService;
import com.internyay.service.DistrictCauseListRelayService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/cause-list-relay")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminCauseListRelayController {

    private final DistrictCauseListRelayService service;
    private final CauseListService causeListService;
    private final CauseListAutoRunService autoRun;
    private final CauseListRunLogService runLog;

    @PostMapping("/start")
    public ResponseEntity<CauseListRelayStep> start(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(service.start(date));
    }

    // After a WORKING step: goes on with the automatic reading of the next court rooms
    @PostMapping("/continue")
    public ResponseEntity<CauseListRelayStep> resume() {
        return ResponseEntity.ok(service.resume());
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

    // State of the hourly scheduler: hours, next run and the last run's outcome
    @GetMapping("/schedule")
    public ResponseEntity<CauseListScheduleDto> schedule() {
        return ResponseEntity.ok(autoRun.schedule());
    }

    // Recent runs (automatic and manual), newest first
    @GetMapping("/runs")
    public ResponseEntity<List<CauseListRunDto>> runs(@RequestParam(defaultValue = "30") int limit) {
        return ResponseEntity.ok(runLog.recent(limit));
    }

    // Runs the automatic lookup now, in the background (the same thing the hourly scheduler does). The page follows its
    // progress through /runs. 409 when a run is already going
    @PostMapping("/run-auto")
    public ResponseEntity<?> runAuto(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        CauseListRunDto started = autoRun.startInBackground(date, "Run now");

        if (started == null) {
            return ResponseEntity.status(409).body(Map.of("message", "An automatic run is already going, wait for it to finish"));
        }
        return ResponseEntity.accepted().body(started);
    }
}
