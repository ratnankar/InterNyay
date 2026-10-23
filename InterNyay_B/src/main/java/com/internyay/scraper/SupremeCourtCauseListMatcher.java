package com.internyay.scraper;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Finds a case in a Supreme Court of India cause list PDF. It differs from the Delhi High Court matcher in four ways:
//  - the Supreme Court writes "No." between the case type and the number (SLP(C) No. 13912/2024), a saved case number
//    may or may not have it, so "No." is ignored on both sides
//  - diary number cases are written with a hyphen (Diary No. 37177-2026), a saved one usually has a slash
//  - connected matters carry decimal item numbers (9.1, 42.2), the whole number in front of the dot is returned
//    because the case only stores a whole item number
//  - one line can cover a range of case numbers (636-645/2023), a case inside the range matches
public final class SupremeCourtCauseListMatcher implements ItemNoFinder {

    // 9   9.   9.1   9.1.   42.2)   (the part after the dot belongs to a connected matter)
    private static final Pattern ITEM_BEFORE_CASE =
            Pattern.compile("^\\s*(\\d{1,4})(?:\\.\\d{1,3})?\\.?\\s*[)|:\\-]?\\s*$");
    private static final Pattern NO_WORD = Pattern.compile("(?i)\\bNos?\\b\\.?");
    private static final Pattern DIARY_HYPHEN = Pattern.compile("(\\d)\\s*-\\s*(\\d{4})(?!\\d)");
    private static final Pattern TARGET_PARTS = Pattern.compile("^([A-Z]+)(\\d{1,9})/(\\d{4})$");
    private static final String GAP = "[\\s.()\\-]*";

    private final List<String> lines;
    private final String[] normalized;

    public SupremeCourtCauseListMatcher(List<String> rawLines) {
        this.lines = new ArrayList<>(rawLines.size());
        for (String line : rawLines) {
            lines.add(clean(line));
        }
        this.normalized = new String[lines.size()];
        for (int i = 0; i < normalized.length; i++) {
            normalized[i] = CauseListMatcher.normalize(lines.get(i));
        }
    }

    // Drops the word "No."/"Nos." and turns the hyphen of diary numbers into the slash
    static String clean(String text) {
        if (text == null) {
            return "";
        }
        String out = NO_WORD.matcher(text).replaceAll(" ");

        if (out.toUpperCase().contains("DIARY")) {
            out = DIARY_HYPHEN.matcher(out).replaceAll("$1/$2");
        }
        return out;
    }

    @Override
    public Optional<Integer> findItemNo(String caseNo) {
        String target = CauseListMatcher.normalize(clean(caseNo));

        if (target.length() < 5 || !Character.isLetter(target.charAt(0)) || target.indexOf('/') < 0) {
            return Optional.empty();
        }

        Optional<Integer> found = scan(buildExact(target), m -> true, text -> text.contains(target));

        if (found.isPresent()) {
            return found;
        }

        Matcher parts = TARGET_PARTS.matcher(target);

        if (!parts.matches()) {
            return Optional.empty();
        }

        String type = parts.group(1);
        long number = Long.parseLong(parts.group(2));
        String year = parts.group(3);

        return scan(buildRange(type),
                m -> Integer.parseInt(m.group(3)) == Integer.parseInt(year)
                        && Long.parseLong(m.group(1)) <= number
                        && number <= Long.parseLong(m.group(2)),
                text -> text.contains(type) && text.contains("/" + year));
    }

    // Goes through the lines, a case number may also be split over two lines
    private Optional<Integer> scan(Pattern pattern, Predicate<Matcher> accept, Predicate<String> prefilter) {
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);

            if (prefilter.test(normalized[i])) {
                Optional<Integer> found = itemFor(pattern, accept, line, i, line.length());
                if (found.isPresent()) {
                    return found;
                }
            }

            if (i + 1 < lines.size() && prefilter.test(normalized[i] + normalized[i + 1])) {
                Optional<Integer> found = itemFor(pattern, accept, line + " " + lines.get(i + 1), i, line.length());
                if (found.isPresent()) {
                    return found;
                }
            }
        }
        return Optional.empty();
    }

    private Optional<Integer> itemFor(Pattern pattern, Predicate<Matcher> accept, String text,
                                      int lineIndex, int firstLineLength) {
        Matcher matcher = pattern.matcher(text);

        while (matcher.find()) {
            if (matcher.start() >= firstLineLength) {
                return Optional.empty();
            }

            if (!accept.test(matcher)) {
                continue;
            }

            String prefix = text.substring(0, matcher.start());
            Matcher item = ITEM_BEFORE_CASE.matcher(prefix);

            if (item.matches()) {
                return Optional.of(Integer.parseInt(item.group(1)));
            }

            if (prefix.isBlank() && lineIndex > 0) {
                Matcher above = ITEM_BEFORE_CASE.matcher(lines.get(lineIndex - 1));
                if (above.matches()) {
                    return Optional.of(Integer.parseInt(above.group(1)));
                }
            }
        }
        return Optional.empty();
    }

    private static Pattern buildExact(String target) {
        StringBuilder regex = new StringBuilder("(?<![A-Za-z0-9])");
        appendSpaced(regex, target);
        regex.append("(?![0-9])");
        return Pattern.compile(regex.toString(), Pattern.CASE_INSENSITIVE);
    }

    // Case type, then a range like 636-645/2023 (groups: first number, last number, year)
    private static Pattern buildRange(String type) {
        StringBuilder regex = new StringBuilder("(?<![A-Za-z0-9])");
        appendSpaced(regex, type);
        regex.append(GAP).append("(\\d{1,9})\\s*-\\s*(\\d{1,9})\\s*/\\s*(\\d{4})(?![0-9])");
        return Pattern.compile(regex.toString(), Pattern.CASE_INSENSITIVE);
    }

    private static void appendSpaced(StringBuilder regex, String text) {
        for (int i = 0; i < text.length(); i++) {
            if (i > 0) {
                regex.append(GAP);
            }
            regex.append(Pattern.quote(String.valueOf(text.charAt(i))));
        }
    }
}
