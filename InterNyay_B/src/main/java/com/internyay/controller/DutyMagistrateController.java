package com.internyay.controller;

import com.internyay.dto.DutyMagistrateDto;
import com.internyay.dto.DutyMagistrateRequest;
import com.internyay.service.DutyMagistrateService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

import java.util.List;

// Duty magistrate roster (Quick Access), managed by admin
@RestController
@RequestMapping("/api/quick-access/duty-magistrate")
@RequiredArgsConstructor
public class DutyMagistrateController {

    private final DutyMagistrateService dutyMagistrateService;

    // Everyone can read the roster
    @GetMapping
    public ResponseEntity<List<DutyMagistrateDto>> list(
            @RequestParam(required = false) String court,
            @RequestParam(required = false) String district) {

        return ResponseEntity.ok(
                dutyMagistrateService.list(court, district).stream().map(DutyMagistrateDto::from).toList());
    }

    // Admin: add a roster entry
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<DutyMagistrateDto> create(@Valid @ModelAttribute DutyMagistrateRequest req) {
        return ResponseEntity.ok(DutyMagistrateDto.from(dutyMagistrateService.create(req)));
    }

    // Admin: edit a roster entry
    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<DutyMagistrateDto> update(@PathVariable Long id,
                                                    @Valid @ModelAttribute DutyMagistrateRequest req) {
        return ResponseEntity.ok(DutyMagistrateDto.from(dutyMagistrateService.update(id, req)));
    }

    // Admin: delete a roster entry
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        dutyMagistrateService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
