package com.internyay.util;

// Status values of a to-do task
public final class TaskStatuses {

    public static final String PENDING     = "Pending";
    public static final String IN_PROGRESS = "In Progress";
    public static final String COMPLETED   = "Completed";

    // Utility class, no objects
    private TaskStatuses() {}

    // Any unknown or empty status becomes Pending
    public static String normalize(String status) {
        if (status == null) return PENDING;
        String s = status.trim().replace('_', ' ');
        if (s.equalsIgnoreCase(COMPLETED))   return COMPLETED;
        if (s.equalsIgnoreCase(IN_PROGRESS)) return IN_PROGRESS;
        return PENDING;
    }
}
