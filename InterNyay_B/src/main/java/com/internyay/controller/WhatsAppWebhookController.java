package com.internyay.controller;

import com.internyay.service.WhatsAppWebhookService;
import com.internyay.util.WebhookSignature;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/api/whatsapp/webhook")
@Slf4j
public class WhatsAppWebhookController {

    private final WhatsAppWebhookService service;
    private final String verifyToken;
    private final String appSecret;

    public WhatsAppWebhookController(
            WhatsAppWebhookService service,
            @Value("${whatsapp.webhook.verify-token:}") String verifyToken,
            @Value("${whatsapp.webhook.app-secret:}") String appSecret) {
        this.service = service;
        this.verifyToken = verifyToken == null ? "" : verifyToken.trim();
        this.appSecret = appSecret == null ? "" : appSecret.trim();
    }

    @GetMapping
    public ResponseEntity<String> verify(
            @RequestParam(name = "hub.mode", required = false) String mode,
            @RequestParam(name = "hub.verify_token", required = false) String token,
            @RequestParam(name = "hub.challenge", required = false) String challenge) {

        boolean ok = "subscribe".equals(mode)
                && !verifyToken.isEmpty()
                && token != null
                && challenge != null
                && MessageDigest.isEqual(
                        verifyToken.getBytes(StandardCharsets.UTF_8),
                        token.getBytes(StandardCharsets.UTF_8));

        if (!ok) {
            log.warn("WhatsApp webhook verification refused");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(challenge);
    }

    @PostMapping
    public ResponseEntity<Void> receive(
            @RequestBody byte[] body,
            @RequestHeader(name = "X-Hub-Signature-256", required = false) String signature) {

        if (!WebhookSignature.valid(body, signature, appSecret)) {
            log.warn("WhatsApp webhook rejected: bad or missing signature");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        try {
            service.handle(body);
        } catch (RuntimeException ex) {
            log.error("WhatsApp webhook processing failed", ex);
        }
        return ResponseEntity.ok().build();
    }
}
