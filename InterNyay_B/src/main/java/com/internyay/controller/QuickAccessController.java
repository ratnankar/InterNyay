package com.internyay.controller;

import com.internyay.dto.*;
import com.internyay.service.QuickAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// Quick Access: judges on leave lookup
@RestController
@RequestMapping("/api/quick-access")
@RequiredArgsConstructor
public class QuickAccessController {

    private final QuickAccessService service;

    // Judges on leave for a date, filtered by court or district
    @GetMapping("/judges-on-leave")
    public ResponseEntity<JudgeOnLeaveResponse> judgesOnLeave(
            @RequestParam(required = false) String court,
            @RequestParam(required = false) String district) {

        return ResponseEntity.ok(
                service.getJudgesOnLeave(
                        court,
                        district
                )
        );
    }
}
