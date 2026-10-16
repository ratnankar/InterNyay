package com.internyay.util;

// Case status values that mean the case is over
public final class CaseStatuses {

    // Statuses that end a case
    public static final String DECIDED   = "Decided";
    public static final String WITHDRAWN = "Withdrawn";

    // Outcome saved when a case is withdrawn
    public static final String WITHDRAWN_OUTCOME = WITHDRAWN;

    // Utility class, no objects
    private CaseStatuses() {}

    // True for Decided or Withdrawn
    public static boolean isClosed(String status) {
        if (status == null) return false;

        String s = status.trim();
        return DECIDED.equalsIgnoreCase(s)
                || WITHDRAWN.equalsIgnoreCase(s);
    }

    // True only for Withdrawn
    public static boolean isWithdrawn(String status) {
        return status != null && WITHDRAWN.equalsIgnoreCase(status.trim());
    }
}
