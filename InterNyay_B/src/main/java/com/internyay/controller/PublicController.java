package com.internyay.controller;

import com.internyay.dto.ContactPublicRequest;
import com.internyay.service.ContactService;
import com.internyay.dto.OptionItemDto;
import com.internyay.service.LeadService;
import com.internyay.service.OptionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

// Endpoints that need no login
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicController {

    private final LeadService leadService;
    private final ContactService contactService;
    private final OptionService optionService;

    // Landing page contact form, stored as a lead for the admin
    @PostMapping("/contact")
    public ResponseEntity<Map<String, String>> contact(@Valid @RequestBody ContactPublicRequest request,
                                                      HttpServletRequest http) {
        leadService.checkRate(http.getRemoteAddr());
        contactService.submitPublic(request);
        return ResponseEntity.ok(Map.of("message", "Thanks! We'll get back to you by email."));
    }

    // Dropdown choices managed by the admin (hidden ones left out); needed before sign-in for registration and contact forms
    @GetMapping("/options")
    public ResponseEntity<Map<String, List<OptionItemDto>>> options() {
        return ResponseEntity.ok(optionService.publicOptions());
    }
}
