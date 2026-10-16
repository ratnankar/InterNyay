package com.internyay.util;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

// Loose matching of court numbers and judge names, since eCourts and users write them differently
public final class CourtMatch {

    // Words ignored in a court number, like "Court No."
    private static final Set<String> COURT_NO_NOISE = Set.of("court", "room", "no", "nos", "number");

    // Titles and designations ignored in a judge name
    private static final Set<String> NAME_NOISE = Set.of(
            "sh", "shri", "smt", "smti", "ms", "mrs", "mr", "dr", "ld", "hon", "ble", "honble",
            "justice", "judge", "the", "dj", "adj", "asj", "cmm", "acmm", "mm", "cj", "jj");

    // A group of digits
    private static final Pattern DIGIT_RUN = Pattern.compile("\\d+");

    // Roman numeral at the end of a name, like "Rajesh Kumar (II)"
    private static final Pattern TRAILING_NUMERAL =
            Pattern.compile(".*[\\s\\-(]+([ivx]{1,4})\\s*\\)?\\s*$");

    // Utility class, no objects
    private CourtMatch() {}

    // Cleans a court number so "Court No. 05" and "5" look the same
    public static String courtNo(String value) {
        if (value == null) return null;

        String cleaned = Arrays.stream(value.toLowerCase(Locale.ROOT).split("[^a-z0-9]+"))
                .filter(s -> !s.isEmpty() && !COURT_NO_NOISE.contains(s))
                .collect(Collectors.joining());

        if (cleaned.isEmpty()) return null;
        if (cleaned.chars().allMatch(Character::isDigit)) {
            cleaned = cleaned.replaceFirst("^0+(?=\\d)", "");
        }
        return cleaned;
    }

    // The only number inside the value, null when there are none or several
    public static String courtNoNumber(String value) {
        if (value == null) return null;

        Matcher m = DIGIT_RUN.matcher(value);
        String only = null;

        while (m.find()) {
            if (only != null) return null;
            only = m.group();
        }

        return only == null ? null : only.replaceFirst("^0+(?=\\d)", "");
    }

    // True when both values point to the same court room
    public static boolean sameCourtNo(String a, String b) {
        String x = courtNo(a);
        String y = courtNo(b);

        if (x == null || y == null) return false;
        if (x.equals(y)) return true;

        String numberA = courtNoNumber(a);
        return numberA != null && numberA.equals(courtNoNumber(b));
    }

    // True when both names are probably the same judge
    public static boolean sameJudge(String a, String b) {

        // Different numerals mean different judges
        String numeralA = numeralSuffix(a);
        String numeralB = numeralSuffix(b);
        if (numeralA != null && numeralB != null && !numeralA.equals(numeralB)) return false;

        // Compare the names word by word without titles
        Set<String> first = nameTokens(a, numeralA);
        Set<String> second = nameTokens(b, numeralB);
        if (first.isEmpty() || second.isEmpty()) return false;

        // Every word of the shorter name must be found in the longer one
        Set<String> small = first.size() <= second.size() ? first : second;
        Set<String> large = small == first ? second : first;

        // A single word only matches when both names are the same length
        if (small.size() < 2 && small.size() != large.size()) return false;

        return small.stream().allMatch(t -> large.stream().anyMatch(o -> tokenMatch(t, o)));
    }

    // Roman numeral at the end of the name, if any
    private static String numeralSuffix(String name) {
        if (name == null) return null;

        Matcher m = TRAILING_NUMERAL.matcher(name.trim().toLowerCase(Locale.ROOT));
        return m.matches() ? m.group(1) : null;
    }

    // Lower case words of the name without titles and the numeral
    private static Set<String> nameTokens(String name, String numeralSuffix) {
        if (name == null) return Set.of();

        Set<String> tokens = Arrays.stream(name.toLowerCase(Locale.ROOT).split("[^a-z]+"))
                .filter(s -> !s.isEmpty() && !NAME_NOISE.contains(s))
                .collect(Collectors.toCollection(java.util.LinkedHashSet::new));

        if (numeralSuffix != null) tokens.remove(numeralSuffix);
        return tokens;
    }

    // Words match when equal, or when one is just an initial of the other
    private static boolean tokenMatch(String a, String b) {
        if (a.equals(b)) return true;
        if (a.length() == 1) return b.startsWith(a);
        if (b.length() == 1) return a.startsWith(b);
        return false;
    }
}
