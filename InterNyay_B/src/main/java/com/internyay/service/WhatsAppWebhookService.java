package com.internyay.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.entity.WhatsAppMessageLog;
import com.internyay.repository.WhatsAppMessageLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
@Slf4j
@RequiredArgsConstructor
public class WhatsAppWebhookService {

    private static final Map<String, Integer> RANK = Map.of("SENT", 1, "DELIVERED", 2, "READ", 3);
    private static final int MAX_ERROR = 500;

    private final WhatsAppMessageLogRepository logRepo;
    private final ObjectMapper objectMapper;

    @Transactional
    public void handle(byte[] body) {
        JsonNode root;
        try {
            root = objectMapper.readTree(body);
        } catch (IOException ex) {
            log.warn("WhatsApp webhook body is not valid JSON");
            return;
        }

        for (JsonNode entry : root.path("entry")) {
            for (JsonNode change : entry.path("changes")) {
                String field = change.path("field").asText("");
                JsonNode value = change.path("value");

                if ("messages".equals(field)) {
                    for (JsonNode status : value.path("statuses")) {
                        try {
                            applyStatus(status);
                        } catch (RuntimeException ex) {
                            log.error("Could not apply WhatsApp status update", ex);
                        }
                    }
                } else if ("message_template_status_update".equals(field)) {
                    log.info("WhatsApp template {} is now {}",
                            value.path("message_template_name").asText("?"),
                            value.path("event").asText("?"));
                }
            }
        }
    }

    private void applyStatus(JsonNode node) {
        String id = node.path("id").asText("");
        String status = node.path("status").asText("").toUpperCase(Locale.ROOT);
        if (id.isBlank() || status.isBlank()) return;

        Optional<WhatsAppMessageLog> found = logRepo.findFirstByWaMessageId(id);
        if (found.isEmpty()) return;

        WhatsAppMessageLog row = found.get();
        String current = row.getDeliveryStatus() == null ? "" : row.getDeliveryStatus();

        if ("FAILED".equals(status)) {
            if ("DELIVERED".equals(current) || "READ".equals(current)) return;
            row.setDeliveryStatus("FAILED");
            row.setError(errorText(node.path("errors").path(0)));
        } else {
            int next = RANK.getOrDefault(status, 0);
            if (next == 0 || next <= RANK.getOrDefault(current, 0)) return;
            row.setDeliveryStatus(status);
        }

        row.setDeliveryUpdatedAt(LocalDateTime.now());
        logRepo.save(row);
    }

    private static String errorText(JsonNode error) {
        String title = error.path("title").asText("");
        if (title.isBlank()) title = error.path("message").asText("");
        String code = error.path("code").asText("");
        String text = (code.isBlank() ? "" : code + " ") + title;
        text = text.isBlank() ? "WhatsApp could not deliver the message" : text.trim();
        return text.length() > MAX_ERROR ? text.substring(0, MAX_ERROR) : text;
    }
}
