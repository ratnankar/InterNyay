package com.internyay.scraper;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class CourtNoToken {

    private static final Pattern PREFIX = Pattern.compile("^\\W*(COURT\\s*(NUMBER|NO\\.?)?|ROOM\\s*(NO\\.?)?|NO\\.?)\\W*");
    private static final Pattern LEADING = Pattern.compile("^\\W*0*(\\d+[A-Z]?)(?![A-Z0-9])");

    // "Sh. Name, Court No. 4" or "ASJ-02 (Room 004)": the number is not at the start, so look for it after a court/room word
    private static final Pattern MENTION = Pattern.compile(
            "(?<![A-Z0-9])(?:COURT|ROOM|CR)\\s*(?:NUMBER|NO\\.?)?\\s*[-:]?\\s*0*(\\d+[A-Z]?)(?![A-Z0-9])");

    private CourtNoToken() {
    }

    public static String of(String text) {
        if (text == null) {
            return "";
        }

        String upper = text.toUpperCase(Locale.ROOT).trim();
        String stripped = PREFIX.matcher(upper).replaceFirst("");

        Matcher matcher = LEADING.matcher(stripped);

        if (matcher.find()) {
            return matcher.group(1);
        }
        return stripped.replaceAll("[^A-Z0-9]", "");
    }

    public static boolean same(String a, String b) {
        String left = of(a);
        return !left.isEmpty() && left.equals(of(b));
    }

    public static boolean mentions(String text, String courtNo) {
        String wanted = of(courtNo);

        if (text == null || wanted.isEmpty()) {
            return false;
        }

        Matcher matcher = MENTION.matcher(text.toUpperCase(Locale.ROOT));

        while (matcher.find()) {
            if (matcher.group(1).equals(wanted)) {
                return true;
            }
        }
        return false;
    }
}
