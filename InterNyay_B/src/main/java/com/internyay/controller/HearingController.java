package com.internyay.controller;

import com.internyay.dto.*;
import com.internyay.service.HearingService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;

// Hearings across all cases of the advocate
@RestController
@RequestMapping("/api/hearings")
@RequiredArgsConstructor
public class HearingController {

    private final HearingService hearingService;
    private final AuthHelper auth;

    // Paged hearings, used by the dashboard calendar
    @GetMapping
    public ResponseEntity<Page<HearingDto>> list(
            @RequestParam(required = false) Long caseId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(hearingService.list(auth.currentUserId(), caseId, from, to, page, size));
    }

    // Edit a hearing's date, status, notes or fee
    @PutMapping("/{id}")
    public ResponseEntity<HearingDto> update(@PathVariable Long id, @RequestBody HearingRequest req) {
        return ResponseEntity.ok(hearingService.update(id, req, auth.currentUserId()));
    }

    // Delete a hearing, answers with the case's next hearing date (blank when none is left)
    @DeleteMapping("/{id}")
    public ResponseEntity<NextHearingResponse> delete(@PathVariable Long id) {
        return ResponseEntity.ok(hearingService.delete(id, auth.currentUserId()));
    }

    // Attach the court order for a hearing
    @PostMapping(value = "/{id}/order", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<HearingDto> uploadOrder(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String name) throws IOException {

        return ResponseEntity.ok(hearingService.attachOrder(id, file, name, auth.currentUserId()));
    }

    // Download the order eCourts lists for this hearing's date and keep it as the hearing's order
    @PostMapping("/{id}/order/fetch")
    public ResponseEntity<HearingDto> fetchOrder(@PathVariable Long id) {
        return ResponseEntity.ok(hearingService.fetchOrder(id, auth.currentUserId()));
    }

    // Remove the attached order
    @DeleteMapping("/{id}/order")
    public ResponseEntity<HearingDto> removeOrder(@PathVariable Long id) {
        return ResponseEntity.ok(hearingService.removeOrder(id, auth.currentUserId()));
    }
}