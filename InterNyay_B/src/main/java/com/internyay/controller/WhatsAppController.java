package com.internyay.controller;

import com.internyay.dto.WhatsAppSendResultDto;
import com.internyay.dto.WhatsAppStatusDto;
import com.internyay.service.WhatsAppReminderService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

// WhatsApp reminders through the Meta Cloud API
@RestController
@RequestMapping("/api/whatsapp")
@RequiredArgsConstructor
public class WhatsAppController {

    // Body for switching automatic reminders on or off for a case
    public record EnabledRequest(boolean enabled, Integer daysBefore) {}

    private final WhatsAppReminderService service;
    private final AuthHelper auth;
    private final com.internyay.service.PlanService planService;

    // Whether WhatsApp sending is configured
    @GetMapping("/status")
    public ResponseEntity<WhatsAppStatusDto> status() {
        return ResponseEntity.ok(service.status(auth.currentUserId()));
    }

    // Turn automatic reminders on or off for a case and set how many days before
    @PutMapping("/cases/{id}/auto")
    public ResponseEntity<Map<String, Object>> setCase(
            @PathVariable Long id, @RequestBody EnabledRequest req) {
        boolean enabled = service.setCaseEnabled(auth.currentUserId(), id, req.enabled(), req.daysBefore());
        int daysBefore = service.getReminderDaysBefore(auth.currentUserId(), id);
        return ResponseEntity.ok(Map.of("caseId", id, "enabled", enabled, "daysBefore", daysBefore));
    }

    // Send a hearing reminder to the client now
    @PostMapping("/cases/{id}/hearing-reminder")
    public ResponseEntity<WhatsAppSendResultDto> hearingReminder(@PathVariable Long id) {
        return ResponseEntity.ok(service.sendHearingReminder(id, auth.currentUserId()));
    }

    // Send a payment reminder to the client now
    @PostMapping("/cases/{id}/payment-reminder")
    public ResponseEntity<WhatsAppSendResultDto> paymentReminder(@PathVariable Long id) {
        auth.requireNotAssociate();
        // Payment reminders use fee dues, so the plan must include the transactions feature
        com.internyay.entity.User me = auth.currentAccount();
        if (!me.isAdmin() && !planService.hasFeature(me, "transactions")) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "This feature is not included in your plan. Upgrade your plan to use it.");
        }
        return ResponseEntity.ok(service.sendPaymentReminder(id, auth.currentUserId()));
    }
}
