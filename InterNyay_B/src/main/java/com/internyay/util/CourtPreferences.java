package com.internyay.util;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

// Court preferences are kept on the user as a comma separated list of court ids ("12,15,3")
public final class CourtPreferences {

    private CourtPreferences() {}

    // Most courts one user can mark
    public static final int MAX = 30;

    // Ids in the saved order, without duplicates; anything that is not a number is skipped
    public static List<Long> parse(String raw) {
        if (raw == null || raw.isBlank()) return new ArrayList<>();
        Set<Long> ids = new LinkedHashSet<>();
        for (String part : raw.split(",")) {
            try {
                ids.add(Long.parseLong(part.trim()));
            } catch (NumberFormatException ignored) {
                // a damaged value is left out instead of breaking the page
            }
        }
        return new ArrayList<>(ids);
    }

    // Text stored on the user, null when the list is empty
    public static String join(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return null;
        return String.join(",", ids.stream().map(String::valueOf).toList());
    }
}
