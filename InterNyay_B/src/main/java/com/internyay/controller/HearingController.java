package com.interNyay.controller;

import com.interNyay.entity.Hearing;
import com.interNyay.service.HearingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/hearings")
@RequiredArgsConstructor
public class HearingController {

    private final HearingService hearingService;

    @GetMapping("/case/{cnr}")
    public List<Hearing> listByCase(@PathVariable String cnr) {
        return hearingService.findByCnr(cnr);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Hearing> update(@PathVariable Long id, @RequestBody Hearing hearing) {
        return ResponseEntity.ok(hearingService.update(id, hearing));
    }

    // fetchOrder(...) REMOVED — order PDF is no longer fetched via API
}