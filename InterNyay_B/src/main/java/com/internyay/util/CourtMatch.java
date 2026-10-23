package com.internyay.util;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
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

        // Roman numerals tell judges with the same name apart: both must carry the same one, or neither
        String numeralA = numeralSuffix(a);
        String numeralB = numeralSuffix(b);
        if (!java.util.Objects.equals(numeralA, numeralB)) return false;

        List<String> first = nameTokens(a, numeralA);
        List<String> second = nameTokens(b, numeralB);
        if (first.isEmpty() || second.isEmpty()) return false;

        List<String> small = first.size() <= second.size() ? first : second;
        List<String> large = small == first ? second : first;

        // A surname is never enough: with two or more words, at least two full words (not initials) must be shared.
        // "R. Kumar" or "Akshay Kumar" are not "Rajesh Kumar". A one-word name only matches an identical one-word name.
        long fullWordsShared = small.stream().filter(t -> t.length() > 1 && large.contains(t)).count();
        if (small.size() == 1) {
            if (large.size() != 1 || small.get(0).length() < 2 || !small.get(0).equals(large.get(0))) return false;
        } else if (fullWordsShared < 2) {
            return false;
        }

        // Same number of words only: every word pairs with exactly one word of the other name (any order)
        if (small.size() == large.size()) return pairsUp(small, large);

        // Names with a different number of words are different judges
        return false;
    }

    // Every word of the first list pairs with a different word of the second list
    private static boolean pairsUp(List<String> first, List<String> second) {
        List<String> left = new ArrayList<>(second);
        for (String t : first) {
            String hit = left.stream().filter(o -> tokenMatch(t, o)).findFirst().orElse(null);
            if (hit == null) return false;
            left.remove(hit);
        }
        return true;
    }

    // Type-ahead search: every word typed must start a different word of the name, in any order, ignoring titles.
    // "Ms. Kanika Handa" finds "Kanika Handa", and "handa kan" finds it too
    public static boolean nameSearchMatches(String query, String name) {
        List<String> typed = nameTokens(query, null);
        if (typed.isEmpty() || name == null) return false;

        List<String> left = new ArrayList<>(nameTokens(name, numeralSuffix(name)));
        for (String t : typed) {
            String hit = left.stream().filter(w -> w.startsWith(t)).findFirst().orElse(null);
            if (hit == null) return false;
            left.remove(hit);
        }
        return true;
    }

    // Roman numeral at the end of the name, if any
    private static String numeralSuffix(String name) {
        if (name == null) return null;

        Matcher m = TRAILING_NUMERAL.matcher(name.trim().toLowerCase(Locale.ROOT));
        return m.matches() ? m.group(1) : null;
    }

    // Lower case words of the name without titles and the numeral
    private static List<String> nameTokens(String name, String numeralSuffix) {
        if (name == null) return List.of();

        // Accents are dropped so "Sarita" and "Sarită" compare the same
        String plain = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");

        List<String> tokens = Arrays.stream(plain.toLowerCase(Locale.ROOT).split("[^a-z]+"))
                .filter(s -> !s.isEmpty() && !NAME_NOISE.contains(s))
                .collect(Collectors.toCollection(ArrayList::new));

        // Only the trailing numeral is removed, not a name that happens to look like one
        if (numeralSuffix != null && !tokens.isEmpty()
                && tokens.get(tokens.size() - 1).equals(numeralSuffix)) {
            tokens.remove(tokens.size() - 1);
        }
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
