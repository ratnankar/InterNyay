package com.internyay.controller;

import com.internyay.dto.QuickLinkDto;
import com.internyay.service.QuickLinkService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/quick-access/links")
@RequiredArgsConstructor
public class QuickLinkController {

    private final QuickLinkService service;

    @GetMapping
    public ResponseEntity<QuickLinkDto.Directory> directory() {
        return ResponseEntity.ok(service.publicDirectory());
    }
}
