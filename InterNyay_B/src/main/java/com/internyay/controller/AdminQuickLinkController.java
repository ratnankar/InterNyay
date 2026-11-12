package com.internyay.controller;

import com.internyay.dto.QuickLinkDto;
import com.internyay.dto.QuickLinkRequests;
import com.internyay.service.QuickLinkService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/quick-links")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class AdminQuickLinkController {

    private final QuickLinkService service;

    @GetMapping
    public ResponseEntity<QuickLinkDto.Directory> directory() {
        return ResponseEntity.ok(service.adminDirectory());
    }

    @PostMapping("/groups")
    public ResponseEntity<QuickLinkDto.Directory> createGroup(@Valid @RequestBody QuickLinkRequests.GroupRequest req) {
        return ResponseEntity.ok(service.createGroup(req));
    }

    @PutMapping("/groups/order")
    public ResponseEntity<QuickLinkDto.Directory> reorderGroups(@Valid @RequestBody QuickLinkRequests.OrderRequest req) {
        return ResponseEntity.ok(service.reorderGroups(req.getIds()));
    }

    @PutMapping("/groups/{id}")
    public ResponseEntity<QuickLinkDto.Directory> updateGroup(@PathVariable Long id,
                                                              @Valid @RequestBody QuickLinkRequests.GroupRequest req) {
        return ResponseEntity.ok(service.updateGroup(id, req));
    }

    @DeleteMapping("/groups/{id}")
    public ResponseEntity<QuickLinkDto.Directory> deleteGroup(@PathVariable Long id) {
        return ResponseEntity.ok(service.deleteGroup(id));
    }

    @PutMapping("/groups/{id}/links/order")
    public ResponseEntity<QuickLinkDto.Directory> reorderLinks(@PathVariable Long id,
                                                               @Valid @RequestBody QuickLinkRequests.OrderRequest req) {
        return ResponseEntity.ok(service.reorderLinks(id, req.getIds()));
    }

    @PostMapping("/links")
    public ResponseEntity<QuickLinkDto.Directory> createLink(@Valid @RequestBody QuickLinkRequests.LinkRequest req) {
        return ResponseEntity.ok(service.createLink(req));
    }

    @PutMapping("/links/{id}")
    public ResponseEntity<QuickLinkDto.Directory> updateLink(@PathVariable Long id,
                                                             @Valid @RequestBody QuickLinkRequests.LinkRequest req) {
        return ResponseEntity.ok(service.updateLink(id, req));
    }

    @DeleteMapping("/links/{id}")
    public ResponseEntity<QuickLinkDto.Directory> deleteLink(@PathVariable Long id) {
        return ResponseEntity.ok(service.deleteLink(id));
    }
}
