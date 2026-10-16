package com.internyay.util;

import java.util.LinkedHashMap;
import java.util.Map;

// An advocate can have several specializations, stored in one text field separated by ';'.
// This tidies the value (trims, drops blanks and duplicates) and enforces the length limit.
public final class Specializations {

    public static final int MAX_LENGTH = 1000;

    private Specializations() {}

    // Returns null for null input so "field not sent" stays distinguishable from "cleared" (empty string)
    public static String clean(String raw) {
        if (raw == null) return null;
        Map<String, String> unique = new LinkedHashMap<>();
        for (String part : raw.split(";")) {
            String s = part.trim();
            if (!s.isEmpty()) unique.putIfAbsent(s.toLowerCase(), s);
        }
        String joined = String.join("; ", unique.values());
        if (joined.length() > MAX_LENGTH) {
            throw new IllegalArgumentException("Too many specializations selected");
        }
        return joined;
    }
}
