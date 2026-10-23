package com.internyay.scraper;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public record CaseKey(String type, int number, int year) {

    private static final Pattern PART = Pattern.compile(
            "([A-Za-z][A-Za-z0-9 .()\\-]*?)[\\s/.\\-]*?(\\d{1,6})\\s*/\\s*(\\d{4})(?!\\d)");

    public static Optional<CaseKey> parse(String text) {
        List<CaseKey> all = findAll(text);
        return all.isEmpty() ? Optional.empty() : Optional.of(all.get(0));
    }

    public static List<CaseKey> findAll(String text) {
        List<CaseKey> keys = new ArrayList<>();

        if (text == null) {
            return keys;
        }

        Matcher matcher = PART.matcher(text);

        while (matcher.find()) {
            String type = squash(matcher.group(1)).replaceFirst("(?<=[A-Z])(NUMBER|NO)$", "")
                    .replaceFirst("^VIEW(?=[A-Z])", "");

            if (type.isEmpty()) {
                continue;
            }
            keys.add(new CaseKey(type, Integer.parseInt(matcher.group(2)), Integer.parseInt(matcher.group(3))));
        }
        return keys;
    }

    private static String squash(String raw) {
        String upper = raw.toUpperCase(Locale.ROOT);
        StringBuilder out = new StringBuilder(upper.length());

        for (int i = 0; i < upper.length(); i++) {
            char ch = upper.charAt(i);
            if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) {
                out.append(ch);
            }
        }
        return out.toString();
    }
}
