package com.internyay.scraper;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;

// The website of each Delhi district court, taken from the Judges on Leave list (DistrictLeaveUrls), so a district is
// added in one place only
public final class DistrictSiteUrls {

    private static final String LEAVE_PAGE = "judges-on-leave/";

    // Districts named differently in the courts table than on their website (Rouse Avenue Courts belong to New Delhi)
    private static final Map<String, String> ALIASES = Map.of("rouseavenue", "newdelhi");

    private DistrictSiteUrls() {
    }

    // The district's website like https://southdelhi.dcourts.gov.in/ , empty when the district has none (e.g. outside Delhi)
    public static Optional<String> baseUrlFor(String district) {
        String wanted = squash(district);
        wanted = ALIASES.getOrDefault(wanted, wanted);

        for (DistrictLeaveUrls.DistrictInfo info : DistrictLeaveUrls.URLS) {
            if (squash(info.district()).equals(wanted)) {
                String url = info.url();
                return Optional.of(url.endsWith(LEAVE_PAGE) ? url.substring(0, url.length() - LEAVE_PAGE.length()) : url);
            }
        }
        return Optional.empty();
    }

    private static String squash(String text) {
        return text == null ? "" : text.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }
}
