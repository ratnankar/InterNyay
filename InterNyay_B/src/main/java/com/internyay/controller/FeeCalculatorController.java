package com.internyay.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.internyay.service.FeeCalculatorService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

// Court fee calculator rules: every signed-in user reads them, only the admin changes them
@RestController
@RequiredArgsConstructor
public class FeeCalculatorController {

    private final FeeCalculatorService service;

    // Rules used by the calculator
    @GetMapping("/api/fee-calculator/config")
    public ResponseEntity<Map<String, Object>> read() {
        return ResponseEntity.ok(wrap(service.current()));
    }

    // Admin: same data for the editor
    @GetMapping("/api/admin/fee-calculator")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> adminRead() {
        return ResponseEntity.ok(wrap(service.current()));
    }

    // Admin: save the rules
    @PutMapping("/api/admin/fee-calculator")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> save(@RequestBody JsonNode body) {
        return ResponseEntity.ok(wrap(service.save(body)));
    }

    // Admin: go back to the built-in defaults
    @PostMapping("/api/admin/fee-calculator/reset")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> reset() {
        return ResponseEntity.ok(wrap(service.reset()));
    }

    private static Map<String, Object> wrap(JsonNode cfg) {
        Map<String, Object> m = new HashMap<>();
        m.put("config", cfg);
        return m;
    }
}
