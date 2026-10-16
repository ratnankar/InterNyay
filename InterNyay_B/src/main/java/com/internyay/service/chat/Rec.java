package com.internyay.service.chat;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

// Small builder for tool result maps that skips empty values
final class Rec {

    private final Map<String, Object> map = new LinkedHashMap<>();

    // New empty record
    static Rec of() {
        return new Rec();
    }

    // Start from an existing map
    static Rec from(Map<String, Object> base) {
        Rec rec = new Rec();
        rec.map.putAll(base);
        return rec;
    }

    // Adds the value only when it is not null, blank or empty
    Rec put(String key, Object value) {
        if (value == null) return this;
        if (value instanceof String s && s.isBlank()) return this;
        if (value instanceof Collection<?> c && c.isEmpty()) return this;
        if (value instanceof Map<?, ?> m && m.isEmpty()) return this;
        map.put(key, value instanceof BigDecimal b ? rupees(b) : value);
        return this;
    }

    // Adds the value even if empty, money values are shown as plain numbers
    Rec always(String key, Object value) {
        map.put(key, value instanceof BigDecimal b ? rupees(b) : value);
        return this;
    }

    // Indian digit grouping, e.g. Rs. 1,25,000 or Rs. 1,25,000.50, so the model copies amounts instead of formatting them
    static String rupees(BigDecimal amount) {
        BigDecimal v = amount.stripTrailingZeros();
        if (v.scale() < 0) v = v.setScale(0);
        String plain = v.abs().toPlainString();
        String whole = plain.contains(".") ? plain.substring(0, plain.indexOf('.')) : plain;
        String frac = plain.contains(".") ? plain.substring(plain.indexOf('.')) : "";
        if (frac.length() == 2) frac += "0";
        String grouped;
        if (whole.length() <= 3) {
            grouped = whole;
        } else {
            String head = whole.substring(0, whole.length() - 3);
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < head.length(); i++) {
                if (i > 0 && (head.length() - i) % 2 == 0) sb.append(',');
                sb.append(head.charAt(i));
            }
            grouped = sb + "," + whole.substring(whole.length() - 3);
        }
        return (v.signum() < 0 ? "-" : "") + "Rs. " + grouped + frac;
    }

    // The finished map
    Map<String, Object> map() {
        return map;
    }
}
