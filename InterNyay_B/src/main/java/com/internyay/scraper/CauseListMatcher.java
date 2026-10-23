package com.internyay.scraper;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class CauseListMatcher implements ItemNoFinder {

    private static final Pattern ITEM_BEFORE_CASE = Pattern.compile("^\\s*(\\d{1,4})\\s*[.)|:\\-]?\\s*$");
    private static final String GAP = "[\\s.()\\-]*";

    private final List<String> lines;
    private final String[] normalized;

    public CauseListMatcher(List<String> lines) {
        this.lines = lines;
        this.normalized = new String[lines.size()];
        for (int i = 0; i < normalized.length; i++) {
            normalized[i] = normalize(lines.get(i));
        }
    }

    public static String normalize(String text) {
        if (text == null) {
            return "";
        }
        String upper = text.toUpperCase(Locale.ROOT);
        StringBuilder out = new StringBuilder(upper.length());
        for (int i = 0; i < upper.length(); i++) {
            char ch = upper.charAt(i);
            if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '/') {
                out.append(ch);
            }
        }
        return out.toString();
    }

    @Override
    public Optional<Integer> findItemNo(String caseNo) {
        String target = normalize(caseNo);
        if (target.length() < 5 || !Character.isLetter(target.charAt(0)) || target.indexOf('/') < 0) {
            return Optional.empty();
        }

        Pattern pattern = buildPattern(target);

        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);

            if (normalized[i].contains(target)) {
                Optional<Integer> found = itemFor(pattern, line, i, line.length());
                if (found.isPresent()) {
                    return found;
                }
            }

            if (i + 1 < lines.size() && !normalized[i].contains(target)
                    && (normalized[i] + normalized[i + 1]).contains(target)) {
                Optional<Integer> found = itemFor(pattern, line + " " + lines.get(i + 1), i, line.length());
                if (found.isPresent()) {
                    return found;
                }
            }
        }
        return Optional.empty();
    }

    private Optional<Integer> itemFor(Pattern pattern, String text, int lineIndex, int firstLineLength) {
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            if (matcher.start() >= firstLineLength) {
                return Optional.empty();
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

    private static Pattern buildPattern(String target) {
        StringBuilder regex = new StringBuilder("(?<![A-Za-z0-9])");
        for (int i = 0; i < target.length(); i++) {
            if (i > 0) {
                regex.append(GAP);
            }
            regex.append(Pattern.quote(String.valueOf(target.charAt(i))));
        }
        regex.append("(?![0-9])");
        return Pattern.compile(regex.toString(), Pattern.CASE_INSENSITIVE);
    }
}
