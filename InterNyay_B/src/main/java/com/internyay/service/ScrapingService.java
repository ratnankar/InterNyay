package com.internyay.service;

import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Optional;

/**
 * Scrapes eCourts case-status pages directly.
 * Replaces EcourtsOrderService + NextHearingSyncService.
 *
 * The CAPTCHA step is intentionally isolated in solveCaptcha() so you can swap in
 * user-relay / OCR / 3rd-party solver without touching the parsing code.
 */
@Slf4j
@Service
public class ScrapingService {

    private static final String BASE_URL = "https://services.ecourts.gov.in/ecourtindia_v6/";
    private static final String CASE_STATUS_PATH = "/?p=home&c=1";

    private final RestClient restClient;

    public ScrapingService() {
        this.restClient = RestClient.builder()
                .baseUrl(BASE_URL)
                .defaultHeader("User-Agent",
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                        "(KHTML, like Gecko) Chrome/120 Safari/537.36")
                .defaultHeader("Accept-Language", "en-IN,en;q=0.9")
                .build();
    }

    public Optional<String> findOrderForDate(String cnr, LocalDate hearingDate) {
        if (cnr == null || hearingDate == null) return Optional.empty();
        try {
            String html = fetchCaseStatusHtml(cnr);
            return parseOrderForDate(html, hearingDate);
        } catch (Exception e) {
            log.warn("Scrape failed for CNR {} on {}: {}", cnr, hearingDate, e.getMessage());
            return Optional.empty();
        }
    }

    private String fetchCaseStatusHtml(String cnr) {
        // Prime session cookie
        restClient.get().uri(CASE_STATUS_PATH).retrieve().body(String.class);

        String captchaAnswer = solveCaptcha(cnr);

        return restClient.post()
                .uri(CASE_STATUS_PATH)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body("cino=" + cnr + "&search_type=cs&captcha=" + captchaAnswer)
                .retrieve()
                .body(String.class);
    }

    /**
     * Plug your CAPTCHA strategy here. Options:
     *   a) relay to the logged-in user in the UI (most compliant),
     *   b) Tesseract OCR on the CAPTCHA image,
     *   c) 2Captcha / Anti-Captcha API,
     *   d) pre-authenticated session cookie.
     * Until this is implemented, findOrderForDate() returns empty and no
     * order numbers will be populated.
     */
    private String solveCaptcha(String cnr) {
        throw new UnsupportedOperationException("CAPTCHA solver not configured");
    }

    private Optional<String> parseOrderForDate(String html, LocalDate targetDate) {
        Document doc = Jsoup.parse(html);
        Elements rows = doc.select(
                "table#order_data tr, table#final_order_data tr, table.order_table tr");

        for (Element row : rows) {
            Elements cells = row.select("td");
            if (cells.size() < 2) continue;

            LocalDate rowDate = parseDate(cells.get(0).text());
            if (!targetDate.equals(rowDate)) continue;

            Element link = cells.get(1).selectFirst("a");
            String text = (link != null ? link.text() : cells.get(1).text()).trim();
            if (!text.isEmpty()) return Optional.of(text);
        }
        return Optional.empty();
    }

    private LocalDate parseDate(String raw) {
        if (raw == null) return null;
        String text = raw.trim();
        for (DateTimeFormatter f : List.of(
                DateTimeFormatter.ofPattern("dd-MM-yyyy"),
                DateTimeFormatter.ofPattern("dd/MM/yyyy"),
                DateTimeFormatter.ofPattern("yyyy-MM-dd"))) {
            try { return LocalDate.parse(text, f); }
            catch (DateTimeParseException ignored) { }
        }
        return null;
    }
}