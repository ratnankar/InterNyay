package com.internyay.controller;

import com.internyay.dto.AppPreferenceDto;
import com.internyay.dto.AppPreferenceRequest;
import com.internyay.service.AppPreferenceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// Preferences of the Calendar app (court colours, court filter, view settings). They belong to the signed-in account
// itself, so an associate and the advocate each have their own
@RestController
@RequestMapping("/api/app-preferences")
@RequiredArgsConstructor
public class AppPreferenceController {

    private final AppPreferenceService service;
    private final AuthHelper auth;

    @GetMapping
    public ResponseEntity<AppPreferenceDto> get() {
        return ResponseEntity.ok(service.get(auth.currentAccountId()));
    }

    // The response is what the server stores (the stored copy, when it is newer than this change)
    @PutMapping
    public ResponseEntity<AppPreferenceDto> save(@Valid @RequestBody AppPreferenceRequest req) {
        return ResponseEntity.ok(service.save(auth.currentAccountId(), req));
    }
}
