package com.internyay.controller;

import com.internyay.scheduler.SchedulerRegistry;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Admin > Schedulers: when each background job runs
@RestController
@RequestMapping("/api/admin/schedulers")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminSchedulerController {

    private final SchedulerRegistry registry;

    @Data
    public static class UpdateRequest {
        @NotBlank public String cron;
        public boolean enabled = true;
        // Which hearing date(s) the job looks up (TODAY, TOMORROW ...); ignored by jobs without a date choice
        public String target;

    }

    @Data
    public static class RunRequest {
        public String target;
    }

    @GetMapping
    public ResponseEntity<List<SchedulerRegistry.JobView>> list() {
        return ResponseEntity.ok(registry.list());
    }

    @PutMapping("/{key}")
    public ResponseEntity<SchedulerRegistry.JobView> update(@PathVariable String key,
                                                            @RequestBody UpdateRequest req) {
        return ResponseEntity.ok(registry.update(key, req.getCron(), req.isEnabled(), req.getTarget()));
    }

    // "Run now": starts the job in the background; the card shows when it is done
    @PostMapping("/{key}/run")
    public ResponseEntity<Void> run(@PathVariable String key, @RequestBody(required = false) RunRequest req) {
        registry.runNow(key, req == null ? null : req.getTarget());
        return ResponseEntity.accepted().build();
    }
}
