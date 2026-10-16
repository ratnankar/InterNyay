package com.internyay.util;

// Helper for email addresses
public final class Emails {

    // Utility class, not meant to be created
    private Emails() {
    }

    // Trimmed lower case email, empty string when null
    public static String normalize(String rawEmail) {
        return rawEmail == null ? "" : rawEmail.trim().toLowerCase();
    }
}
