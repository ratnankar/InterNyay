package com.internyay.controller;

import com.internyay.dto.*;
import com.internyay.service.PlanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Admin edits subscription plans and which features each one includes
@RestController
@RequestMapping("/api/admin/plans")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminPlanController {

    private final PlanService plans;

    // All plans
    @GetMapping
    public ResponseEntity<List<PlanDto>> list() {
        return ResponseEntity.ok(plans.allPlans());
    }

    // Every feature key that can be switched on for a plan
    @GetMapping("/catalog")
    public ResponseEntity<java.util.Map<String, String>> catalog() {
        return ResponseEntity.ok(PlanService.CATALOG);
    }

    // Add a new plan
    @PostMapping
    public ResponseEntity<PlanDto> create(@Valid @RequestBody PlanRequest req) {
        return ResponseEntity.ok(plans.create(req));
    }

    // Move every advocate on one plan to another plan (send dryRun true to preview who would move)
    @PostMapping("/migrate")
    public ResponseEntity<PlanMigrateResult> migrate(@Valid @RequestBody PlanMigrateRequest req) {
        return ResponseEntity.ok(plans.migrateAll(req));
    }

    // Remove a plan; moveTo is the plan code its advocates are switched to (needed when accounts are on it)
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @RequestParam(required = false) String moveTo) {
        plans.delete(id, moveTo);
        return ResponseEntity.noContent().build();
    }

    // Update plan price, limits and feature list
    @PutMapping("/{id}")
    public ResponseEntity<PlanDto> update(@PathVariable Long id, @Valid @RequestBody PlanRequest req) {
        return ResponseEntity.ok(plans.update(id, req));
    }
}
