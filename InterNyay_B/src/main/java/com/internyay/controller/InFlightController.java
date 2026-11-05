package com.internyay.controller;

import com.internyay.config.InFlightRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// Which actions of the signed-in account are still running on the server (see InFlightRegistry).
// The pages call this after a refresh or when the tab is opened again, so a button stays unavailable while its action runs
@RestController
@RequestMapping("/api/in-flight")
@RequiredArgsConstructor
public class InFlightController {

    private final InFlightRegistry registry;
    private final AuthHelper auth;

    @GetMapping
    public ResponseEntity<List<String>> running() {
        return ResponseEntity.ok(registry.of(String.valueOf(auth.currentAccountId())));
    }
}
