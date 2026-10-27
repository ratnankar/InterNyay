package com.interNyay.controller;

import com.interNyay.entity.Case;
import com.interNyay.service.CaseService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/case")
@RequiredArgsConstructor
public class CaseController {

    private final CaseService caseService;

    @GetMapping("/{cnr}")
    public Case getCase(@PathVariable String cnr) {
        return caseService.findByCnr(cnr);
    }

    // syncNextHearing(...) REMOVED — the API-based sync is gone.
}