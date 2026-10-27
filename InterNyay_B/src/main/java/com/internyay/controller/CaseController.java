package com.internyay.controller;

import com.internyay.dto.*;
import com.internyay.service.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/cases")
@RequiredArgsConstructor
public class CaseController {

    private final CaseService caseService;
    private final HearingLeaveService hearingLeaveService;
    private final DocumentService documentService;
    private final HearingService hearingService;
    private final FileNumberService fileNumberService;
    private final CnrLookupService cnrLookup;
    private final AuthHelper auth;
    private final com.internyay.service.PlanService planService;
    // ===== NEW =====
    private final NextHearingUpdateService nextHearingUpdateService;

    private boolean feesHidden() {
        if (auth.isAssociate()) return true;
        com.internyay.entity.User me = auth.currentAccount();
        return !me.isAdmin() && !planService.hasFeature(me, "transactions");
    }

    @GetMapping
    public ResponseEntity<Page<CaseDto>> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) Long clientId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<CaseDto> result = caseService.list(auth.currentUserId(), search, status, type, clientId, page, size);
        return ResponseEntity.ok(feesHidden() ? result.map(CaseDto::withoutFees) : result);
    }

    @GetMapping("/file-numbers")
    public ResponseEntity<FileNumberSummaryDto> fileNumbers() {
        return ResponseEntity.ok(fileNumberService.summary(auth.currentUserId()));
    }

    @GetMapping("/hearing-leave")
    public ResponseEntity<List<HearingLeaveDto>> hearingLeave(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(hearingLeaveService.onLeaveFor(auth.currentUserId(), date));
    }

    @PostMapping("/cnr/start")
    public ResponseEntity<CnrLookupService.Step> startCnr(@RequestParam String cnr) {
        return ResponseEntity.ok(cnrLookup.start(auth.currentUserId(), cnr));
    }

    @PostMapping("/cnr/{sessionId}/answer")
    public ResponseEntity<CnrLookupService.Step> answerCnr(
            @PathVariable String sessionId, @Valid @RequestBody CnrAnswer body) {
        return ResponseEntity.ok(cnrLookup.answer(auth.currentUserId(), sessionId, body.captcha()));
    }

    @PostMapping("/cnr/{sessionId}/refresh")
    public ResponseEntity<CnrLookupService.Step> refreshCnr(@PathVariable String sessionId) {
        return ResponseEntity.ok(cnrLookup.refresh(auth.currentUserId(), sessionId));
    }

    @PostMapping
    public ResponseEntity<CaseDto> create(@Valid @RequestBody CaseRequest req) {
        if (feesHidden()) req.clearFees();
        return ResponseEntity.ok(feesFor(caseService.create(req, auth.currentUserId())));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CaseDto> update(@PathVariable Long id, @RequestBody CaseRequest req) {
        if (feesHidden()) req.clearFees();
        return ResponseEntity.ok(feesFor(caseService.update(id, req, auth.currentUserId())));
    }

    private CaseDto feesFor(CaseDto dto) {
        return feesHidden() ? dto.withoutFees() : dto;
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        caseService.delete(id, auth.currentUserId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/hearings")
    public ResponseEntity<List<HearingDto>> hearings(@PathVariable Long id) {
        return ResponseEntity.ok(hearingService.listForCase(id, auth.currentUserId()));
    }

    @PutMapping("/{id}/next-hearing")
    public ResponseEntity<NextHearingResponse> updateNextHearing(
            @PathVariable Long id, @RequestBody NextHearingRequest req) {
        return ResponseEntity.ok(hearingService.moveNextHearing(id, req, auth.currentUserId()));
    }

    // ===== NEW: manual "Refresh" button — reads the eCourts portal right now =====
    // Returns 404 when the case is not found or not owned by the caller (the service throws
    // IllegalArgumentException for both cases; from the API's point of view they are the same).
    @PostMapping("/{id}/refresh-hearing")
    public ResponseEntity<NextHearingUpdateService.RefreshResult> refreshHearing(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(nextHearingUpdateService.refreshSingleCase(id, auth.currentUserId()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/documents")
    public ResponseEntity<List<DocumentDto>> getDocs(@PathVariable Long id) {
        return ResponseEntity.ok(documentService.listForCase(id, auth.currentUserId()));
    }

    @PostMapping(value = "/{id}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DocumentDto> uploadDoc(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String type) throws IOException {
        return ResponseEntity.ok(
                documentService.uploadForCase(id, file, name, type, auth.currentUserId()));
    }
}