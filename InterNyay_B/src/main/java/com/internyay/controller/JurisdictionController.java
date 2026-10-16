package com.internyay.controller;

import com.internyay.dto.JurisdictionDto;
import com.internyay.dto.JurisdictionRequests;
import com.internyay.service.ConsumerJurisdictionService;
import com.internyay.service.DrtJurisdictionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

// Find Jurisdiction data for Quick Access: DRT and Consumer Commissions
@RestController
@RequestMapping("/api/quick-access/jurisdiction")
@RequiredArgsConstructor
public class JurisdictionController {

    private final DrtJurisdictionService drt;
    private final ConsumerJurisdictionService consumer;

    // All DRT tribunals with their police station lists
    @GetMapping("/drt")
    public ResponseEntity<JurisdictionDto.Drt> drtDirectory() {
        return ResponseEntity.ok(drt.directory());
    }

    // Admin: add a tribunal
    @PostMapping("/drt/tribunals")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<JurisdictionDto.Drt> createTribunal(@Valid @RequestBody JurisdictionRequests.TribunalRequest req) {
        return ResponseEntity.ok(drt.create(req));
    }

    // Admin: edit a tribunal
    @PutMapping("/drt/tribunals/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<JurisdictionDto.Drt> updateTribunal(@PathVariable Long id,
                                                              @Valid @RequestBody JurisdictionRequests.TribunalRequest req) {
        return ResponseEntity.ok(drt.update(id, req));
    }

    // Admin: delete a tribunal
    @DeleteMapping("/drt/tribunals/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<JurisdictionDto.Drt> deleteTribunal(@PathVariable Long id) {
        return ResponseEntity.ok(drt.delete(id));
    }

    // All consumer commissions with their police stations
    @GetMapping("/consumer")
    public ResponseEntity<JurisdictionDto.Consumer> consumerDirectory() {
        return ResponseEntity.ok(consumer.directory());
    }

    // Admin: add a commission
    @PostMapping("/consumer/commissions")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<JurisdictionDto.Consumer> createCommission(@Valid @RequestBody JurisdictionRequests.CommissionRequest req) {
        return ResponseEntity.ok(consumer.create(req));
    }

    // Admin: edit a commission
    @PutMapping("/consumer/commissions/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<JurisdictionDto.Consumer> updateCommission(@PathVariable Long id,
                                                                     @Valid @RequestBody JurisdictionRequests.CommissionRequest req) {
        return ResponseEntity.ok(consumer.update(id, req));
    }

    // Admin: delete a commission
    @DeleteMapping("/consumer/commissions/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<JurisdictionDto.Consumer> deleteCommission(@PathVariable Long id) {
        return ResponseEntity.ok(consumer.delete(id));
    }
}
