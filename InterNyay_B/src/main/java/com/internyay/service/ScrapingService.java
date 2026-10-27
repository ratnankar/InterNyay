package com.interNyay.service;

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
 * NOTE: eCourts requires a CAPTCHA to reach case-status HTML. You must plug
 * in a CAPTCHA strategy (user-solved relay, Tesseract OCR, or a paid solver)
 * inside solveCaptcha(). Everything else here is ready.
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

    /**
     * Returns the order number/filename for the given CNR + hearing date,
     * or Optional.empty() if no order exists for that date.
     */
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

    /**
     * Two-step eCourts flow:
     *   1. GET case-status page → session cookie + CAPTCHA.
     *   2. POST CNR + CAPTCHA answer → case-status HTML.
     * RestClient keeps cookies automatically within the same instance.
     */
    private String fetchCaseStatusHtml(String cnr) {
        // Step 1: prime session
        restClient.get().uri(CASE_STATUS_PATH).retrieve().body(String.class);

        // Step 2: obtain + solve CAPTCHA (see TODO)
        String captchaAnswer = solveCaptcha(cnr);

        return restClient.post()
                .uri(CASE_STATUS_PATH)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body("cino=" + cnr + "&search_type=cs&captcha=" + captchaAnswer)
                .retrieve()
                .body(String.class);
    }

    /**
     * TODO: implement your CAPTCHA strategy. Options:
     *   a) Relayed to the user in the UI (best compliance-wise).
     *   b) Tesseract OCR on the CAPTCHA image URL.
     *   c) 2Captcha / Anti-Captcha HTTP API.
     *   d) A pre-authenticated session cookie (if your org has one).
     */
    private String solveCaptcha(String cnr) {
        throw new UnsupportedOperationException(
                "CAPTCHA solving not implemented — plug in OCR / solver / user relay here");
    }

    /** Parses the order/final-order table for a matching date. */
    private Optional<String> parseOrderForDate(String html, LocalDate targetDate) {
        Document doc = Jsoup.parse(html);

        // eCourts order tables vary; cover common selectors.
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
            catch (DateTimeParseException ignored) { /* try next */ }
        }
        return null;
    }
}