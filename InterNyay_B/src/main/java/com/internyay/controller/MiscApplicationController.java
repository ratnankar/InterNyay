package com.internyay.controller;

import com.internyay.dto.MiscApplicationDto;
import com.internyay.dto.MiscApplicationRequest;
import com.internyay.service.MiscApplicationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

// Misc. applications of the logged in advocate (associates see their advocate's)
@RestController
@RequestMapping("/api/misc-applications")
@RequiredArgsConstructor
public class MiscApplicationController {

    private final MiscApplicationService service;
    private final AuthHelper auth;

    // Paged, filterable list
    @GetMapping
    public ResponseEntity<Page<MiscApplicationDto>> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long caseId,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(service.list(auth.currentUserId(), status, caseId, search, page, Math.min(size, 100)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<MiscApplicationDto> get(@PathVariable Long id) {
        return ResponseEntity.ok(service.get(id, auth.currentUserId()));
    }

    // Add an application, in an existing case or in a new one
    @PostMapping
    public ResponseEntity<MiscApplicationDto> create(@Valid @RequestBody MiscApplicationRequest req) {
        return ResponseEntity.ok(service.create(req, auth.currentUserId()));
    }

    // Edit the type, history and dates
    @PutMapping("/{id}")
    public ResponseEntity<MiscApplicationDto> update(@PathVariable Long id, @Valid @RequestBody MiscApplicationRequest req) {
        return ResponseEntity.ok(service.update(id, req, auth.currentUserId()));
    }

    // Mark as disposed off (body: { "disposedOn": "yyyy-MM-dd" }, the date is optional)
    @PutMapping("/{id}/dispose")
    public ResponseEntity<MiscApplicationDto> dispose(@PathVariable Long id,
                                                      @RequestBody(required = false) Map<String, String> body) {
        String day = body == null ? null : body.get("disposedOn");
        return ResponseEntity.ok(service.dispose(id, day, auth.currentUserId()));
    }

    // Back to pending
    @PutMapping("/{id}/reopen")
    public ResponseEntity<MiscApplicationDto> reopen(@PathVariable Long id) {
        return ResponseEntity.ok(service.reopen(id, auth.currentUserId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id, auth.currentUserId());
        return ResponseEntity.noContent().build();
    }

    // Upload the application (role APPLICATION), its order (ORDER, once disposed off) or an additional document (ADDITIONAL)
    @PostMapping(value = "/{id}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MiscApplicationDto> uploadDocument(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String name,
            @RequestParam String role) throws IOException {
        return ResponseEntity.ok(service.uploadDocument(id, file, name, role, auth.currentUserId()));
    }

    // Remove one document of the application
    @DeleteMapping("/{id}/documents/{docId}")
    public ResponseEntity<MiscApplicationDto> removeDocument(@PathVariable Long id, @PathVariable String docId) {
        return ResponseEntity.ok(service.removeDocument(id, docId, auth.currentUserId()));
    }
}
