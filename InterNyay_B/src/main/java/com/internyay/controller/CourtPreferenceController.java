package com.internyay.controller;

import com.internyay.dto.CourtPreferenceDto;
import com.internyay.dto.CourtPreferenceRequest;
import com.internyay.entity.User;
import com.internyay.service.CourtPreferenceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// The courts the signed-in advocate or associate works at (set on the profile or right after sign-up)
@RestController
@RequestMapping("/api/court-preferences")
@RequiredArgsConstructor
public class CourtPreferenceController {

    private final CourtPreferenceService service;
    private final AuthHelper auth;

    // Chosen courts and the courts to open by default
    @GetMapping
    public ResponseEntity<CourtPreferenceDto> get() {
        User me = auth.currentAccount();
        return ResponseEntity.ok(service.get(me, auth.currentUserId()));
    }

    // Replaces the chosen courts; an empty list clears them
    @PutMapping
    public ResponseEntity<CourtPreferenceDto> save(@RequestBody CourtPreferenceRequest req) {
        return ResponseEntity.ok(service.save(auth.currentAccountId(), auth.currentUserId(), req.getCourtIds()));
    }
}
