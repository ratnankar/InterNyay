package com.internyay.controller;

import com.internyay.dto.CourtDto;
import com.internyay.dto.CourtRequest;
import com.internyay.dto.MahilaCourtRequest;
import com.internyay.service.CourtService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Court table: courts, districts, buildings and court numbers
@RestController
@RequestMapping("/api/courts")
@RequiredArgsConstructor
public class CourtController {

    private final CourtService courtService;

    @GetMapping
    public ResponseEntity<List<CourtDto>> list() {
        return ResponseEntity.ok(courtService.list());
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<CourtDto>> add(@Valid @RequestBody CourtRequest req) {
        return ResponseEntity.ok(courtService.add(req));
    }

    // Admin: mark or unmark a court room as a Mahila court
    @PutMapping("/{id}/mahila")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<CourtDto>> setMahila(@PathVariable Long id,
                                                    @RequestBody MahilaCourtRequest req) {
        return ResponseEntity.ok(courtService.setMahilaCourt(id, req.mahilaCourt()));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<CourtDto>> delete(@PathVariable Long id,
                                                 @RequestParam(defaultValue = "row") String scope) {
        return ResponseEntity.ok(courtService.delete(id, scope));
    }
}
