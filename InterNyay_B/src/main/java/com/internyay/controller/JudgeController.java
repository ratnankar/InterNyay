package com.internyay.controller;

import com.internyay.dto.CourtNoLogDto;
import com.internyay.dto.CourtNoRecordDto;
import com.internyay.dto.CourtNoRecordRequest;
import com.internyay.dto.JudgeChangeRequest;
import com.internyay.dto.JudgeCourtNoDto;
import com.internyay.dto.JudgeDto;
import com.internyay.dto.JudgeRefDto;
import com.internyay.dto.JudgeRequest;
import com.internyay.service.JudgeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Judges List listings (Quick Access): court seats with their judge, managed by admin
@RestController
@RequestMapping("/api/quick-access/judges-list")
@RequiredArgsConstructor
public class JudgeController {

    private final JudgeService judgeService;

    // Full list with optional filters; the court history is only sent when asked for (admin editor)
    @GetMapping
    public ResponseEntity<List<JudgeDto>> list(
            @RequestParam(required = false) String court,
            @RequestParam(required = false) String district,
            @RequestParam(defaultValue = "false") boolean includeHistory) {

        return ResponseEntity.ok(
                judgeService.toDtos(judgeService.list(court, district), includeHistory));
    }

    // Type-ahead search used by the admin pickers
    @GetMapping("/search")
    public ResponseEntity<List<JudgeRefDto>> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String court,
            @RequestParam(required = false) String district,
            @RequestParam(defaultValue = "20") int limit) {

        return ResponseEntity.ok(
                judgeService.search(q, court, district, limit).stream().map(JudgeRefDto::from).toList());
    }

    // Court numbers, used to match cases with judges on leave
    @GetMapping("/court-numbers")
    public ResponseEntity<List<JudgeCourtNoDto>> courtNumbers(
            @RequestParam(required = false) String court,
            @RequestParam(required = false) String district) {

        return ResponseEntity.ok(judgeService.courtNumbers(court, district));
    }

    // Admin: add a listing with its judge (an existing judge, or a new one with a photo)
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<JudgeDto> create(@Valid @ModelAttribute JudgeRequest req) {
        return ResponseEntity.ok(judgeService.toDto(judgeService.create(req)));
    }

    // Admin: edit a listing (its judge stays, use change-judge to change it)
    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<JudgeDto> update(@PathVariable Long id,
                                           @Valid @ModelAttribute JudgeRequest req) {
        return ResponseEntity.ok(judgeService.toDto(judgeService.update(id, req)));
    }

    // Admin: change the judge of a listing (the listing stays, only its judge changes; history is kept)
    @PostMapping("/{id}/change-judge")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<JudgeDto> changeJudge(@PathVariable Long id,
                                                  @Valid @RequestBody JudgeChangeRequest req) {
        return ResponseEntity.ok(judgeService.toDto(judgeService.changeJudge(id, req)));
    }

    // Court history for a court and district, with the judge who sat in each court number
    @GetMapping("/court-no-log")
    public ResponseEntity<List<CourtNoLogDto>> courtNoLog(
            @RequestParam(required = false) String court,
            @RequestParam(required = false) String district) {

        return ResponseEntity.ok(judgeService.courtNoLog(court, district));
    }

    @PostMapping("/{id}/court-numbers")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<CourtNoRecordDto>> addCourtNo(@PathVariable Long id,
                                                             @Valid @RequestBody CourtNoRecordRequest req) {
        return ResponseEntity.ok(judgeService.addPastCourtNo(id, req));
    }

    @PutMapping("/{id}/court-numbers/{recordId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<CourtNoRecordDto>> updateCourtNo(@PathVariable Long id,
                                                                @PathVariable Long recordId,
                                                                @Valid @RequestBody CourtNoRecordRequest req) {
        return ResponseEntity.ok(judgeService.updateCourtNo(id, recordId, req));
    }

    @DeleteMapping("/{id}/court-numbers/{recordId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<CourtNoRecordDto>> deleteCourtNo(@PathVariable Long id,
                                                                @PathVariable Long recordId) {
        return ResponseEntity.ok(judgeService.deleteCourtNo(id, recordId));
    }

    // Admin: remove a listing. It is switched off, never deleted: its court history stays
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        judgeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
