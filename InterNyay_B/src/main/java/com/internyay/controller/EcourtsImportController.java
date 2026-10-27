package com.internyay.controller;

import com.internyay.dto.EcourtsImportDto;
import com.internyay.dto.EcourtsImportRequest;
import com.internyay.service.EcourtsImportService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// The "Import from eCourts" list (cases of the uploaded My Cases file). It belongs to the signed-in account itself,
// so an associate and the advocate each have their own, and it is there on every device the account signs in on
@RestController
@RequestMapping("/api/ecourts-import")
@RequiredArgsConstructor
public class EcourtsImportController {

    private final EcourtsImportService service;
    private final AuthHelper auth;

    @GetMapping
    public ResponseEntity<EcourtsImportDto> get() {
        return ResponseEntity.ok(service.get(auth.currentAccountId()));
    }

    // The response is what the server keeps (the stored list, when it is newer than this upload)
    @PutMapping
    public ResponseEntity<EcourtsImportDto> save(@Valid @RequestBody EcourtsImportRequest req) {
        return ResponseEntity.ok(service.save(auth.currentAccountId(), req));
    }

    @DeleteMapping
    public ResponseEntity<Void> clear() {
        service.clear(auth.currentAccountId());
        return ResponseEntity.noContent().build();
    }
}
