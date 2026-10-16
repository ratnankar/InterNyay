package com.internyay.controller;

import com.internyay.dto.OptionItemDto;
import com.internyay.dto.OptionItemRequest;
import com.internyay.service.OptionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

// Admin edits the dropdown choices of the app
@RestController
@RequestMapping("/api/admin/options")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminOptionController {

    private final OptionService options;

    // Every choice, hidden ones included, and the lists they belong to
    @GetMapping
    public ResponseEntity<Map<String, Object>> list() {
        return ResponseEntity.ok(Map.of("lists", options.lists(), "items", options.all()));
    }

    @PostMapping
    public ResponseEntity<OptionItemDto> create(@Valid @RequestBody OptionItemRequest req) {
        return ResponseEntity.ok(options.create(req));
    }

    @PutMapping("/{id}")
    public ResponseEntity<OptionItemDto> update(@PathVariable Long id, @Valid @RequestBody OptionItemRequest req) {
        return ResponseEntity.ok(options.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        options.delete(id);
        return ResponseEntity.noContent().build();
    }

    // Move a choice up or down
    @PostMapping("/{id}/move")
    public ResponseEntity<Void> move(@PathVariable Long id, @RequestParam String dir) {
        options.move(id, "up".equalsIgnoreCase(dir));
        return ResponseEntity.noContent().build();
    }

    // Move a choice straight to a place in its list (0 = first)
    @PostMapping("/{id}/move-to")
    public ResponseEntity<Void> moveTo(@PathVariable Long id, @RequestParam int position) {
        options.moveTo(id, position);
        return ResponseEntity.noContent().build();
    }
}
