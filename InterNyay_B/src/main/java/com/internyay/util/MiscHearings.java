package com.internyay.util;

import com.internyay.entity.Hearing;

import java.util.regex.Pattern;

// Older versions saved a misc. application's date into the case's hearing history as a line "Misc. Application: <name>".
// Applications keep their own hearing history now, so an entry that holds nothing but such lines (no note, order or
// outcome) is not a hearing of the case. Same rule as isMiscOnlyHearing in the frontend (miscUtils.js)
public final class MiscHearings {

    private static final Pattern LINE = Pattern.compile("^\\s*misc\\.?\\s*application\\s*:\\s*(.+?)\\s*$", Pattern.CASE_INSENSITIVE);

    private MiscHearings() {}

    public static boolean isMiscOnly(Hearing h) {
        if (h == null) return false;
        if (h.getOrderDocId() != null && !h.getOrderDocId().isBlank()) return false;
        if (h.getOutcome() != null && !h.getOutcome().isBlank()) return false;
        if (h.getNotes() == null || h.getNotes().isBlank()) return false;

        boolean sawApplication = false;
        for (String line : h.getNotes().split("\\R")) {
            if (line.isBlank()) continue;
            if (!LINE.matcher(line).matches()) return false;
            sawApplication = true;
        }
        return sawApplication;
    }
}
