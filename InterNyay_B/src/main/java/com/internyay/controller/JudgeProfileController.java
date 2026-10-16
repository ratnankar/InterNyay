package com.internyay.controller;

import com.internyay.dto.JudgeProfileDto;
import com.internyay.dto.JudgeProfileRequest;
import com.internyay.service.JudgeProfileService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Judges (name and photo only), managed by admin. Where a judge sits is a listing, see JudgeController
@RestController
@RequestMapping("/api/quick-access/judge-profiles")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class JudgeProfileController {

    private final JudgeProfileService profileService;

    // Every judge with the courts each holds now (none = not in any listing)
    @GetMapping
    public ResponseEntity<List<JudgeProfileDto>> list() {
        return ResponseEntity.ok(profileService.list());
    }

    // Add a judge (multipart because of the photo)
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<JudgeProfileDto> create(@Valid @ModelAttribute JudgeProfileRequest req) {
        return ResponseEntity.ok(profileService.toDto(profileService.create(req)));
    }

    // Edit a judge's name and photo
    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<JudgeProfileDto> update(@PathVariable Long id, @Valid @ModelAttribute JudgeProfileRequest req) {
        return ResponseEntity.ok(profileService.toDto(profileService.update(id, req)));
    }

    // Remove a judge who holds no court. A judge with history is switched off and kept, the history stays
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        profileService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
