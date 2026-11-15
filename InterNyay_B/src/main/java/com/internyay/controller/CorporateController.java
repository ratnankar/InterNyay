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

// Corporate view. /corporate/** is for the corporate account (an account on a corporate plan), /mine for its hired advocates
@RestController
@RequestMapping("/api/corporate")
@RequiredArgsConstructor
public class CorporateController {

    private final CorporateService service;
    private final AuthHelper auth;

    private User corporate() { return service.requireCorporate(auth.currentAccount()); }

    // ----- Corporate account -----

    @GetMapping("/manage/advocates")
    public ResponseEntity<List<CorporateService.AdvocateRow>> advocates() {
        return ResponseEntity.ok(service.advocates(corporate()));
    }

    @PostMapping("/manage/advocates")
    public ResponseEntity<CorporateService.AdvocateRow> createAdvocate(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(service.createAdvocate(corporate(), body.get("name"), body.get("email"),
                body.get("phone"), body.get("barNo"), body.get("password")));
    }

    @PutMapping("/manage/advocates/{id}/active")
    public ResponseEntity<CorporateService.AdvocateRow> setActive(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        return ResponseEntity.ok(service.setActive(corporate(), id, Boolean.TRUE.equals(body.get("active"))));
    }

    @PutMapping("/manage/advocates/{id}/password")
    public ResponseEntity<Void> resetPassword(@PathVariable Long id, @RequestBody Map<String, String> body) {
        service.resetPassword(corporate(), id, body.get("password"));
        return ResponseEntity.noContent().build();
    }

    // Upload one or more MIS spreadsheets and allot every case found in them to one advocate
    @PostMapping(value = "/manage/allot", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<CorporateService.AllotResult> allot(@RequestParam Long advocateId,
                                                              @RequestParam("files") List<MultipartFile> files,
                                                              @RequestParam(defaultValue = "true") boolean skipClosed) {
        return ResponseEntity.ok(service.allot(corporate(), advocateId, files, skipClosed));
    }

    @GetMapping("/manage/allotments")
    public ResponseEntity<List<CorporateService.AllotmentRow>> allotments(@RequestParam(required = false) Long advocateId,
                                                                          @RequestParam(required = false) String search) {
        return ResponseEntity.ok(service.corporateAllotments(corporate(), advocateId, search));
    }

    @PutMapping("/manage/allotments/{id}/advocate")
    public ResponseEntity<Void> reassign(@PathVariable Long id, @RequestBody Map<String, Long> body) {
        service.reassign(corporate(), id, body.get("advocateId"));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/manage/allotments/{id}")
    public ResponseEntity<Void> remove(@PathVariable Long id) {
        service.remove(corporate(), id);
        return ResponseEntity.noContent().build();
    }

    // ----- Hired advocate -----

    @GetMapping("/mine")
    public ResponseEntity<List<CorporateService.AllotmentRow>> mine() {
        return ResponseEntity.ok(service.mine(service.requireHired(auth.currentAccount())));
    }

    // ----- Uploaded spreadsheet (the corporate account that uploaded it) -----

    @GetMapping("/manage/sheet/{id}")
    public ResponseEntity<byte[]> sheet(@PathVariable Long id) {
        CorporateSheet sheet = service.sheetFor(corporate(), id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(sheet.getFileName(), StandardCharsets.UTF_8).build().toString())
                .body(service.bytesOf(sheet));
    }
}
