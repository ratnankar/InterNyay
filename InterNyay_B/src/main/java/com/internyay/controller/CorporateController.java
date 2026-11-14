package com.internyay.controller;

import com.internyay.entity.CorporateSheet;
import com.internyay.entity.User;
import com.internyay.service.CorporateService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

// Corporate view. /firm/** is for the firm (an account on a corporate plan), /mine for its hired advocates
@RestController
@RequestMapping("/api/corporate")
@RequiredArgsConstructor
public class CorporateController {

    private final CorporateService service;
    private final AuthHelper auth;

    private User firm() { return service.requireFirm(auth.currentAccount()); }

    // ----- Firm -----

    @GetMapping("/firm/advocates")
    public ResponseEntity<List<CorporateService.AdvocateRow>> advocates() {
        return ResponseEntity.ok(service.advocates(firm()));
    }

    @PostMapping("/firm/advocates")
    public ResponseEntity<CorporateService.AdvocateRow> createAdvocate(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(service.createAdvocate(firm(), body.get("name"), body.get("email"),
                body.get("phone"), body.get("barNo"), body.get("password")));
    }

    @PutMapping("/firm/advocates/{id}/active")
    public ResponseEntity<CorporateService.AdvocateRow> setActive(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        return ResponseEntity.ok(service.setActive(firm(), id, Boolean.TRUE.equals(body.get("active"))));
    }

    @PutMapping("/firm/advocates/{id}/password")
    public ResponseEntity<Void> resetPassword(@PathVariable Long id, @RequestBody Map<String, String> body) {
        service.resetPassword(firm(), id, body.get("password"));
        return ResponseEntity.noContent().build();
    }

    // Upload one or more MIS spreadsheets and allot every case found in them to one advocate
    @PostMapping(value = "/firm/allot", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<CorporateService.AllotResult> allot(@RequestParam Long advocateId,
                                                              @RequestParam("files") List<MultipartFile> files,
                                                              @RequestParam(defaultValue = "true") boolean skipClosed) {
        return ResponseEntity.ok(service.allot(firm(), advocateId, files, skipClosed));
    }

    @GetMapping("/firm/allotments")
    public ResponseEntity<List<CorporateService.AllotmentRow>> allotments(@RequestParam(required = false) Long advocateId,
                                                                          @RequestParam(required = false) String search) {
        return ResponseEntity.ok(service.firmAllotments(firm(), advocateId, search));
    }

    @PutMapping("/firm/allotments/{id}/advocate")
    public ResponseEntity<Void> reassign(@PathVariable Long id, @RequestBody Map<String, Long> body) {
        service.reassign(firm(), id, body.get("advocateId"));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/firm/allotments/{id}")
    public ResponseEntity<Void> remove(@PathVariable Long id) {
        service.remove(firm(), id);
        return ResponseEntity.noContent().build();
    }

    // ----- Hired advocate -----

    @GetMapping("/mine")
    public ResponseEntity<List<CorporateService.AllotmentRow>> mine() {
        return ResponseEntity.ok(service.mine(service.requireHired(auth.currentAccount())));
    }

    // ----- Uploaded spreadsheet (the firm that uploaded it) -----

    @GetMapping("/firm/sheet/{id}")
    public ResponseEntity<byte[]> sheet(@PathVariable Long id) {
        CorporateSheet sheet = service.sheetFor(firm(), id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(sheet.getFileName(), StandardCharsets.UTF_8).build().toString())
                .body(service.bytesOf(sheet));
    }
}
