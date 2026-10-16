package com.internyay.util;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

// Rules for a new password, applied wherever the server accepts one (register, Google first password, change, reset, admin create).
// Keep in step with src/utils/passwordPolicy.js in the website, which shows the same messages before the form is sent.
public final class PasswordPolicy {

    public static final int MIN = 8;
    public static final int MAX = 64;
    // bcrypt only reads the first 72 bytes, so longer passwords would be silently cut
    private static final int MAX_BYTES = 72;
    // Email names shorter than this are ignored, otherwise a name like "ravi" would block many fine passwords
    private static final int MIN_EMAIL_NAME = 5;

    private static final Pattern LETTER = Pattern.compile("\\p{L}");
    private static final Pattern DIGIT = Pattern.compile("\\p{Nd}");

    private static final Set<String> COMMON = Set.of(
            "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword1",
            "12345678", "123456789", "1234567890", "12345678a", "qwerty123", "qwertyuiop", "qwerty12",
            "abc12345", "abcd1234", "abcdefg1", "iloveyou1", "iloveyou123", "welcome1", "welcome123",
            "admin123", "admin1234", "letmein123", "monkey123", "dragon123", "football1", "baseball1",
            "india123", "india@123", "internyay", "internyay1", "internyay123", "advocate1", "advocate123",
            "lawyer123", "court123", "test1234", "changeme1", "changeme123", "sunshine1", "princess1");

    // Utility class, not meant to be created
    private PasswordPolicy() {
    }

    // Returns the first problem as a message, or null when the password is fine. email is optional
    public static String problem(String password, String email) {
        String pw = password == null ? "" : password;
        if (pw.isEmpty()) return "Password is required";
        if (pw.length() < MIN) return "Password must be at least " + MIN + " characters";
        if (pw.length() > MAX || pw.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            return "Password must be at most " + MAX + " characters";
        }
        if (pw.isBlank()) return "Password cannot be only spaces";
        if (!LETTER.matcher(pw).find() || !DIGIT.matcher(pw).find()) {
            return "Password must include at least one letter and one number";
        }

        String lower = pw.toLowerCase(Locale.ROOT);
        if (COMMON.contains(lower)) return "That password is too common, choose a harder one";

        String mail = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (!mail.isEmpty()) {
            int at = mail.indexOf('@');
            String local = at >= 0 ? mail.substring(0, at) : mail;
            if (lower.equals(mail) || (local.length() >= MIN_EMAIL_NAME && lower.contains(local))) {
                return "Password must not contain your email address";
            }
        }
        return null;
    }

    // Throws IllegalArgumentException (shown to the user as a 400 message) when the password is not acceptable
    public static void require(String password, String email) {
        String problem = problem(password, email);
        if (problem != null) throw new IllegalArgumentException(problem);
    }
}
