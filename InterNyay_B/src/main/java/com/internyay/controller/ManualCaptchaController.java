package com.internyay.controller;

import com.internyay.dto.CnrAnswer;
import com.internyay.service.ManualCaptchaDesk;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// The CAPTCHA window of the buttons that read eCourts (cause list refresh, next hearing Refresh, Get order). The typed text
// finishes the button's own work, so the answer is whatever that button returns
@RestController
@RequestMapping("/api/captcha")
@RequiredArgsConstructor
public class ManualCaptchaController {

    private final ManualCaptchaDesk desk;
    private final AuthHelper auth;

    @PostMapping("/{id}/answer")
    public ResponseEntity<Object> answer(@PathVariable String id, @Valid @RequestBody CnrAnswer body) {
        return ResponseEntity.ok(desk.answer(auth.currentUserId(), id, body.captcha()));
    }

    @PostMapping("/{id}/refresh")
    public ResponseEntity<ManualCaptchaDesk.Challenge> refresh(@PathVariable String id) {
        return ResponseEntity.ok(desk.refresh(auth.currentUserId(), id));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<Void> cancel(@PathVariable String id) {
        desk.cancel(auth.currentUserId(), id);
        return ResponseEntity.noContent().build();
    }
}
