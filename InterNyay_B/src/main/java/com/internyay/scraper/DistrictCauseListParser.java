package com.internyay.scraper;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

public final class DistrictCauseListParser {

    private static final Pattern SERIAL = Pattern.compile("^\\d{1,4}$");

    private DistrictCauseListParser() {
    }

    public static Map<CaseKey, Integer> serialNumbers(String html) {
        Map<CaseKey, Integer> serials = new HashMap<>();
        Document document = Jsoup.parse(html == null ? "" : html);

        for (Element row : document.select("tr")) {
            Elements cells = row.select("td");

            if (cells.size() < 2) {
                continue;
            }

            String first = cells.get(0).text().trim();

            if (!SERIAL.matcher(first).matches()) {
                continue;
            }

            int serial = Integer.parseInt(first);

            for (int i = 1; i < cells.size(); i++) {
                for (CaseKey key : CaseKey.findAll(cells.get(i).text())) {
                    serials.putIfAbsent(key, serial);
                }
            }
        }
        return serials;
    }
}
