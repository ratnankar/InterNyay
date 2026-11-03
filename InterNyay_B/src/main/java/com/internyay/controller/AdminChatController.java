package com.internyay.controller;

import com.internyay.service.chat.ChatContext;
import com.internyay.service.chat.ChatEvalService;
import com.internyay.service.chat.ChatInsightsService;
import com.internyay.service.chat.LegalKnowledge;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashSet;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/chat")
@RequiredArgsConstructor
public class AdminChatController {

    private final ChatInsightsService insights;
    private final ChatEvalService evalService;
    private final LegalKnowledge legalKnowledge;
    private final AuthHelper auth;

    @GetMapping("/insights")
    public ResponseEntity<Map<String, Object>> insights(@RequestParam(defaultValue = "30") int days) {
        return ResponseEntity.ok(insights.insights(days));
    }

    @GetMapping("/eval/cases")
    public ResponseEntity<List<ChatEvalService.Case>> evalCases() {
        return ResponseEntity.ok(evalService.cases());
    }

    // Starts the test questions in the background (or reports the run that is already going)
    @PostMapping("/eval")
    public ResponseEntity<Map<String, Object>> runEval(@RequestParam(required = false) List<String> ids) {
        return ResponseEntity.ok(evalService.start(adminContext(), ids == null ? null : new HashSet<>(ids)));
    }

    // Progress and results of the latest test run; asked again after a page refresh
    @GetMapping("/eval/status")
    public ResponseEntity<Map<String, Object>> evalStatus() {
        return ResponseEntity.ok(evalService.status());
    }

    @PostMapping("/eval/cancel")
    public ResponseEntity<Map<String, Object>> cancelEval() {
        return ResponseEntity.ok(evalService.cancel());
    }

    @PostMapping("/knowledge/reload")
    public ResponseEntity<Map<String, Object>> reloadKnowledge() {
        return ResponseEntity.ok(Map.of("passages", legalKnowledge.reload()));
    }

    @GetMapping("/knowledge")
    public ResponseEntity<Map<String, Object>> knowledge() {
        return ResponseEntity.ok(Map.of("passages", legalKnowledge.size()));
    }

    private ChatContext adminContext() {
        com.internyay.entity.User me = auth.currentAccount();
        return new ChatContext(auth.currentUserId(), me.getId(), me.getName(), false, false, List.of());
    }
}
