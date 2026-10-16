package com.internyay.util;

import java.util.List;

// Which courts a holiday applies to
public final class HolidayCourts {

    // District courts only
    public static final String DISTRICT = "DISTRICT";
    public static final String HIGH     = "HIGH";
    public static final String BOTH     = "BOTH";

    // All allowed values
    public static final List<String> ALL = List.of(DISTRICT, HIGH, BOTH);

    // Utility class, no objects
    private HolidayCourts() {}

    // Returns the value in its proper spelling, throws when it is invalid
    public static String canonical(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Choose which court the holiday applies to");
        }

        String wanted = value.trim();
        return ALL.stream()
                .filter(v -> v.equalsIgnoreCase(wanted))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Holiday court must be one of " + String.join(", ", ALL)));
    }

    // Old holidays without a value apply to both courts
    public static String orDefault(String stored) {
        return stored == null || stored.isBlank() ? BOTH : stored;
    }
}
