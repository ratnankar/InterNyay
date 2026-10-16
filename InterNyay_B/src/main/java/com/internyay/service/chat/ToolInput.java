package com.internyay.service.chat;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;

// Reads the model's tool arguments safely
final class ToolInput {

    private final JsonNode node;

    ToolInput(JsonNode node) {
        this.node = node;
    }

    // Trimmed text or null
    String text(String key) {
        JsonNode v = node == null ? null : node.get(key);
        if (v == null || v.isNull()) return null;
        String s = v.asText().trim();
        return s.isEmpty() ? null : s;
    }

    // Number or numeric text as a Long
    Long id(String key) {
        JsonNode v = node == null ? null : node.get(key);
        if (v == null || v.isNull()) return null;
        if (v.isNumber()) return v.asLong();
        try {
            return Long.parseLong(v.asText().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // Number kept within min and max
    int number(String key, int fallback, int min, int max) {
        Long v = id(key);
        int n = v == null ? fallback : v.intValue();
        return Math.max(min, Math.min(max, n));
    }

    // Boolean with a fallback
    boolean flag(String key, boolean fallback) {
        JsonNode v = node == null ? null : node.get(key);
        if (v == null || v.isNull()) return fallback;
        return v.asBoolean(fallback);
    }

    // ISO date or null
    LocalDate date(String key) {
        String s = text(key);
        if (s == null) return null;
        try {
            return LocalDate.parse(s);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(key + " must be a date in YYYY-MM-DD format");
        }
    }
}
