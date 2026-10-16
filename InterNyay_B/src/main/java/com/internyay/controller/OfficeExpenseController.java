package com.internyay.controller;

import com.internyay.dto.OfficeExpenseDto;
import com.internyay.dto.OfficeExpenseRequest;
import com.internyay.service.OfficeExpenseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

// Office expenses and associate payments
@RestController
@RequestMapping("/api/office-expenses")
@RequiredArgsConstructor
public class OfficeExpenseController {

    private final OfficeExpenseService expenseService;
    private final AuthHelper auth;

    // All expenses of the advocate
    @GetMapping
    public ResponseEntity<List<OfficeExpenseDto>> list() {
        return ResponseEntity.ok(
                expenseService.list(auth.currentUserId(), auth.currentAccountId(), auth.isAssociate()));
    }

    // Add an expense
    @PostMapping
    public ResponseEntity<OfficeExpenseDto> create(@Valid @RequestBody OfficeExpenseRequest req) {
        return ResponseEntity.ok(
                expenseService.create(req, auth.currentUserId(), auth.currentAccountId()));
    }

    // Mark an expense paid or unpaid
    @PutMapping("/{id}/paid")
    public ResponseEntity<OfficeExpenseDto> setPaid(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        if (auth.isAssociate()) {
            throw new AccessDeniedException("Only the advocate can mark an office expense as paid");
        }
        boolean paid = Boolean.TRUE.equals(body.get("paid"));
        return ResponseEntity.ok(expenseService.setPaid(id, paid, auth.currentUserId()));
    }

    // Delete an expense
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        expenseService.delete(id, auth.currentUserId(), auth.currentAccountId(), auth.isAssociate());
        return ResponseEntity.noContent().build();
    }
}
