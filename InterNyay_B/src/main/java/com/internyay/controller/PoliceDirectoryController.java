package com.internyay.controller;

import com.internyay.dto.PoliceDirectoryDto;
import com.internyay.dto.PoliceRequests;
import com.internyay.service.PoliceDirectoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

// Police directory (districts, sub-divisions, stations), edited by admin
@RestController
@RequestMapping("/api/quick-access/police")
@RequiredArgsConstructor
public class PoliceDirectoryController {

    private final PoliceDirectoryService service;

    // Whole directory as one tree
    @GetMapping("/directory")
    public ResponseEntity<PoliceDirectoryDto> directory() {
        return ResponseEntity.ok(service.directory());
    }

    // Admin: add a district
    @PostMapping("/districts")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PoliceDirectoryDto> createDistrict(@Valid @RequestBody PoliceRequests.DistrictRequest req) {
        return ResponseEntity.ok(service.createDistrict(req));
    }

    // Admin: edit a district
    @PutMapping("/districts/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PoliceDirectoryDto> updateDistrict(@PathVariable Long id,
                                                             @Valid @RequestBody PoliceRequests.DistrictRequest req) {
        return ResponseEntity.ok(service.updateDistrict(id, req));
    }

    // Admin: delete a district
    @DeleteMapping("/districts/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PoliceDirectoryDto> deleteDistrict(@PathVariable Long id) {
        return ResponseEntity.ok(service.deleteDistrict(id));
    }

    // Admin: add a sub-division
    @PostMapping("/sub-divisions")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PoliceDirectoryDto> createSubDivision(@Valid @RequestBody PoliceRequests.SubDivisionRequest req) {
        return ResponseEntity.ok(service.createSubDivision(req));
    }

    // Admin: edit a sub-division
    @PutMapping("/sub-divisions/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PoliceDirectoryDto> updateSubDivision(@PathVariable Long id,
                                                                @Valid @RequestBody PoliceRequests.SubDivisionRequest req) {
        return ResponseEntity.ok(service.updateSubDivision(id, req));
    }

    // Admin: delete a sub-division
    @DeleteMapping("/sub-divisions/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PoliceDirectoryDto> deleteSubDivision(@PathVariable Long id) {
        return ResponseEntity.ok(service.deleteSubDivision(id));
    }

    // Admin: add a police station
    @PostMapping("/stations")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PoliceDirectoryDto> createStation(@Valid @RequestBody PoliceRequests.StationRequest req) {
        return ResponseEntity.ok(service.createStation(req));
    }

    // Admin: edit a police station
    @PutMapping("/stations/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PoliceDirectoryDto> updateStation(@PathVariable Long id,
                                                            @Valid @RequestBody PoliceRequests.StationRequest req) {
        return ResponseEntity.ok(service.updateStation(id, req));
    }

    // Admin: delete a police station
    @DeleteMapping("/stations/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PoliceDirectoryDto> deleteStation(@PathVariable Long id) {
        return ResponseEntity.ok(service.deleteStation(id));
    }

    // Admin: edit directory level settings such as the CAW headquarters and footnote
    @PutMapping("/settings")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PoliceDirectoryDto> updateSettings(@Valid @RequestBody PoliceRequests.SettingsRequest req) {
        return ResponseEntity.ok(service.updateSettings(req));
    }
}
