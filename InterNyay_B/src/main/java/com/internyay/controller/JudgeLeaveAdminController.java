package com.internyay.controller;

import com.internyay.dto.AdminJudgeLeaveDto;
import com.internyay.dto.JudgeLeaveRequest;
import com.internyay.service.DailyJudgeLeaveService;
import com.internyay.service.JudgeLeaveAdminService;
import com.internyay.service.JudgeLeaveScraperService.ScrapeResult;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Admin control over the judges on leave data
@RestController
@RequestMapping("/api/admin/judges-on-leave")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class JudgeLeaveAdminController {

    private final DailyJudgeLeaveService service;
    private final JudgeLeaveAdminService adminService;

    // Run the automatic leave collection now
    @PostMapping("/refresh")
    public ResponseEntity<List<ScrapeResult>> refresh() {
        return ResponseEntity.ok(service.scrapeAllDistricts());
    }

    // All leave entries including hidden ones
    @GetMapping
    public ResponseEntity<List<AdminJudgeLeaveDto>> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String court,
            @RequestParam(required = false) String district,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "500") int limit) {

        return ResponseEntity.ok(adminService.list(court, district, status, q, limit));
    }

    // Add a leave entry by hand
    @PostMapping
    public ResponseEntity<AdminJudgeLeaveDto> create(@Valid @RequestBody JudgeLeaveRequest req) {
        return ResponseEntity.ok(adminService.create(req));
    }

    // Edit a leave entry
    @PutMapping("/{id}")
    public ResponseEntity<AdminJudgeLeaveDto> update(@PathVariable Long id,
                                                     @Valid @RequestBody JudgeLeaveRequest req) {
        return ResponseEntity.ok(adminService.update(id, req));
    }

    // Delete a leave entry
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        adminService.delete(id);
        return ResponseEntity.noContent().build();
    }

    // Hide or unhide an entry from advocates without deleting it
    @PutMapping("/{id}/hidden")
    public ResponseEntity<AdminJudgeLeaveDto> setHidden(@PathVariable Long id,
                                                        @RequestBody HiddenRequest req) {
        return ResponseEntity.ok(adminService.setHidden(id, req.isHidden()));
    }

    // Body for the hide toggle
    @Data
    public static class HiddenRequest {
        private boolean hidden;
    }
}
