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

// Cases of the logged in advocate (associates see their advocate's cases)
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

    // Fees are hidden from associates and from plans without the transactions feature
    private boolean feesHidden() {
        if (auth.isAssociate()) return true;
        com.internyay.entity.User me = auth.currentAccount();
        return !me.isAdmin() && !planService.hasFeature(me, "transactions");
    }

    // Paged, filterable case list
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

    // Summary of file numbers used so far, for the next-number suggestion
    @GetMapping("/file-numbers")
    public ResponseEntity<FileNumberSummaryDto> fileNumbers() {
        return ResponseEntity.ok(fileNumberService.summary(auth.currentUserId()));
    }

    // Cases whose judge is on leave on the given date
    @GetMapping("/hearing-leave")
    public ResponseEntity<List<HearingLeaveDto>> hearingLeave(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(hearingLeaveService.onLeaveFor(auth.currentUserId(), date));
    }

    // Case details from the eCourts portal by CNR, to fill the Add Case form. The portal asks for a CAPTCHA, so it is
    // three calls: start (answers with the CAPTCHA image), answer (the typed CAPTCHA; answers with the case, or a new
    // CAPTCHA when it was wrong) and refresh (a new CAPTCHA). 400 with a readable message when the case cannot be read,
    // and the advocate then adds the case manually
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

    // Create a case
    @PostMapping
    public ResponseEntity<CaseDto> create(@Valid @RequestBody CaseRequest req) {
        if (feesHidden()) req.clearFees();
        return ResponseEntity.ok(feesFor(caseService.create(req, auth.currentUserId())));
    }

    // Update a case
    @PutMapping("/{id}")
    public ResponseEntity<CaseDto> update(@PathVariable Long id, @RequestBody CaseRequest req) {
        if (feesHidden()) req.clearFees();
        return ResponseEntity.ok(feesFor(caseService.update(id, req, auth.currentUserId())));
    }

    // Strips the fee fields when the user isn't allowed to see them
    private CaseDto feesFor(CaseDto dto) {
        return feesHidden() ? dto.withoutFees() : dto;
    }

    // Delete a case along with its hearings
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        caseService.delete(id, auth.currentUserId());
        return ResponseEntity.noContent().build();
    }

    // Hearing history of a case
    @GetMapping("/{id}/hearings")
    public ResponseEntity<List<HearingDto>> hearings(@PathVariable Long id) {
        return ResponseEntity.ok(hearingService.listForCase(id, auth.currentUserId()));
    }

    // Set the next hearing date and log the one just heard
    @PutMapping("/{id}/next-hearing")
    public ResponseEntity<NextHearingResponse> updateNextHearing(
            @PathVariable Long id, @RequestBody NextHearingRequest req) {

        return ResponseEntity.ok(hearingService.moveNextHearing(id, req, auth.currentUserId()));
    }

    // "Update next date" endpoint removed: the eCourts-based NextHearingSyncService is gone.
    // Order numbers for a hearing date are now populated automatically when the hearing is updated
    // (see HearingService.update -> ScrapingService.findOrderForDate).

    // Documents attached to a case
    @GetMapping("/{id}/documents")
    public ResponseEntity<List<DocumentDto>> getDocs(@PathVariable Long id) {
        return ResponseEntity.ok(documentService.listForCase(id, auth.currentUserId()));
    }

    // Upload a document to a case
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