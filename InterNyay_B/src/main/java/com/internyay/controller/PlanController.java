package com.internyay.controller;

import com.internyay.dto.*;
import com.internyay.entity.User;
import com.internyay.service.PlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Plan endpoints for the landing page and the My Plan page
@RestController
@RequiredArgsConstructor
public class PlanController {

    private final PlanService plans;
    private final AuthHelper auth;
    private final com.internyay.repository.UserRepository userRepo;

    // Public plans list for the landing page
    @GetMapping("/api/public/plans")
    public ResponseEntity<List<PlanDto>> landing() {
        return ResponseEntity.ok(plans.landingPlans());
    }

    // Features included in the user's plan, the frontend hides the rest
    @GetMapping("/api/plans/features")
    public ResponseEntity<List<String>> features() {
        User owner = userRepo.findById(auth.currentUserId()).orElseThrow();
        if (owner.isAdmin()) return ResponseEntity.ok(List.copyOf(PlanService.CATALOG.keySet()));
        return ResponseEntity.ok(plans.enabledFeatures(owner));
    }

    // The user's current plan and its details
    @GetMapping("/api/plans/my")
    public ResponseEntity<MyPlanDto> mine() {
        User me = auth.currentAccount();
        if (!me.isAdvocate()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(plans.myPlan(me));
    }

    @PostMapping("/api/plans/select")
    public ResponseEntity<MyPlanDto> select(@jakarta.validation.Valid @RequestBody PlanSelectRequest req) {
        User me = auth.currentAccount();
        if (!me.isAdvocate()) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(plans.choosePlan(me, req.getCode(), "year".equalsIgnoreCase(req.getPeriod())));
    }
}
