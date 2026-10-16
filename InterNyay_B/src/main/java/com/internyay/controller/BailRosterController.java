package com.internyay.controller;

import com.internyay.dto.BailRosterDto;
import com.internyay.dto.BailRosterRequest;
import com.internyay.service.BailRosterService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Bail roster entries (Quick Access), managed by admin
@RestController
@RequestMapping("/api/quick-access/bail-roster")
@RequiredArgsConstructor
public class BailRosterController {

    private final BailRosterService bailRosterService;

    // Everyone can read, optionally filtered
    @GetMapping
    public ResponseEntity<List<BailRosterDto>> list(
            @RequestParam(required = false) String court,
            @RequestParam(required = false) String district) {

        return ResponseEntity.ok(
                bailRosterService.list(court, district));
    }

    // Admin: add an entry, optional PDF is uploaded with it
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<BailRosterDto> create(@Valid @ModelAttribute BailRosterRequest req) {
        return ResponseEntity.ok(bailRosterService.create(req));
    }

    // Admin: edit an entry
    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<BailRosterDto> update(@PathVariable Long id,
                                                @Valid @ModelAttribute BailRosterRequest req) {
        return ResponseEntity.ok(bailRosterService.update(id, req));
    }

    // Admin: delete an entry
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        bailRosterService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
