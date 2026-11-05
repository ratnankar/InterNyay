package com.internyay.scraper;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.scraper.DistrictPortalClient.Option;
import com.internyay.scraper.DistrictPortalClient.SubmitResult;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.CookieManager;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

// Reads a cause list from a district court's own website (for example southdelhi.dcourts.gov.in, page "Cause List / Daily
// Board"), instead of the eCourts Services portal. Every district site is a WordPress (S3WaaS) site with the same form:
// court complex, court number, date, civil / criminal and a CAPTCHA, all sent to /wp-admin/admin-ajax.php
@Slf4j
@Component
public class DistrictSiteClient {

    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
    private static final String ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final int CAPTCHA_ID_LENGTH = 40;
    // A court list that keeps growing past this many "load more" pages is not a cause list we should keep reading
    private static final int MAX_MORE_PAGES = 50;
    private static final Duration COURT_LIST_TTL = Duration.ofMinutes(15);

    // One visit of a district site: its cookies, the CAPTCHA token the page carries and the court complexes it offers
    public static final class SiteSession {
        private final HttpClient http;
        private final String base;
        private final String pageUrl;
        private final String tokenName;
        private final String tokenValue;
        private final List<Option> complexes;
        // The CAPTCHA the page itself shows is used for the first answer, every later one is a new picture
        private String captchaId;
        private boolean pageCaptchaUsed;

        private SiteSession(HttpClient http, String base, String pageUrl, String tokenName, String tokenValue,
                            List<Option> complexes, String captchaId) {
            this.http = http;
            this.base = base;
            this.pageUrl = pageUrl;
            this.tokenName = tokenName;
            this.tokenValue = tokenValue;
            this.complexes = complexes;
            this.captchaId = captchaId;
        }
    }

    // What to ask the site for: the court complex (its establishment codes), the court (the site's own value) and civil / criminal
    public record Selection(String complexValue, String courtValue, String courtText, String kind) {}

    private record CachedCourts(Instant at, List<Option> courts) {}

    private final ObjectMapper mapper = new ObjectMapper();
    private final SecureRandom random = new SecureRandom();
    private final Map<String, CachedCourts> courtCache = new ConcurrentHashMap<>();
    private final String pagePath;

    public DistrictSiteClient(
            @Value("${causelist.district-site.page-path:cause-list-%e2%81%84-daily-board/}") String pagePath) {
        this.pagePath = pagePath.startsWith("/") ? pagePath.substring(1) : pagePath;
    }

    // Opens the Cause List page of the district site (baseUrl like https://southdelhi.dcourts.gov.in/)
    public SiteSession open(String baseUrl) throws IOException {
        String base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        String pageUrl = base + pagePath;

        HttpClient http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .cookieHandler(new CookieManager())
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(15))
                .build();

        HttpResponse<String> response = send(http, browserHeaders(HttpRequest.newBuilder(URI.create(pageUrl)))
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .timeout(Duration.ofSeconds(30))
                .GET()
                .build());

        if (response.statusCode() != 200) {
            throw new IOException("the cause list page " + pageUrl + " answered HTTP " + response.statusCode());
        }

        Document page = Jsoup.parse(response.body(), pageUrl);

        // The page carries a hidden token field (its name changes with the site) that goes along with the CAPTCHA
        Element token = page.selectFirst("#siwp_captcha_container_0 input[type=hidden][name^=tok_]");
        if (token == null) token = page.selectFirst("input[type=hidden][name^=tok_]");

        if (token == null) {
            throw new IOException("the cause list page " + pageUrl + " has no CAPTCHA token, its page may have changed");
        }

        List<Option> complexes = new ArrayList<>();
        for (Element option : page.select("select#est_code option")) {
            String value = option.attr("value").trim();
            if (!value.isEmpty()) complexes.add(new Option(value, option.text().trim()));
        }

        if (complexes.isEmpty()) {
            throw new IOException("the cause list page " + pageUrl + " lists no court complex, its page may have changed");
        }

        Element captchaField = page.selectFirst("input#input_siwp_captcha_id_0");
        String captchaId = captchaField != null && !captchaField.attr("value").isBlank()
                ? captchaField.attr("value").trim() : newCaptchaId();

        return new SiteSession(http, base, pageUrl, token.attr("name"), token.attr("value"), complexes, captchaId);
    }

    // The court complexes of the site (value = the establishment codes the form sends, text = the complex name)
    public List<Option> complexes(SiteSession session) {
        return session.complexes;
    }

    // The courts of one court complex: value is the site's own court value, text like "56 MS. AMBIKA SINGH - District Judge - 01"
    public List<Option> courts(SiteSession session, Option complex) throws IOException {
        String key = session.base + "|" + complex.value();
        CachedCourts cached = courtCache.get(key);

        if (cached != null && Duration.between(cached.at(), Instant.now()).compareTo(COURT_LIST_TTL) < 0) {
            return cached.courts();
        }

        Map<String, String> form = new LinkedHashMap<>();
        form.put("service_type", "courtComplex");
        form.put("est_code", complex.value());
        form.put("cause_type", "2");
        form.put("scid", session.captchaId);
        form.put(session.tokenName, session.tokenValue);
        form.put("es_ajax_request", "1");
        form.put("action", "get_court_lists");

        JsonNode answer = post(session, form);

        if (!answer.path("success").asBoolean()) {
            throw new IOException("the court list of " + complex.text() + " was refused: " + messageOf(answer.get("data")));
        }

        List<Option> courts = new ArrayList<>();
        for (Element option : Jsoup.parseBodyFragment(answer.path("data").asText()).select("option")) {
            String value = option.attr("value").trim();
            if (!value.isEmpty()) courts.add(new Option(value, option.text().trim()));
        }

        if (!courts.isEmpty()) courtCache.put(key, new CachedCourts(Instant.now(), courts));
        return courts;
    }

    // A new CAPTCHA picture. The site's CAPTCHA is used once: every answer needs a picture of its own
    public byte[] captcha(SiteSession session) throws IOException {
        if (session.pageCaptchaUsed) {
            session.captchaId = newCaptchaId();
        }
        session.pageCaptchaUsed = true;

        HttpResponse<byte[]> response;

        try {
            response = session.http.send(browserHeaders(HttpRequest.newBuilder(
                            URI.create(session.base + "?_siwp_captcha&id=" + session.captchaId)))
                    .header("Accept", "image/avif,image/webp,image/png,image/*,*/*;q=0.8")
                    .header("Referer", session.pageUrl)
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build(), HttpResponse.BodyHandlers.ofByteArray());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted while loading the CAPTCHA");
        }

        if (response.statusCode() != 200 || response.body().length == 0) {
            throw new IOException("CAPTCHA image request answered HTTP " + response.statusCode());
        }
        return response.body();
    }

    // Asks for the cause list of one court on a date. On success `html` holds every table of the list (all pages)
    public SubmitResult submit(SiteSession session, Selection selection, LocalDate date, String captcha) throws IOException {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("service_type", "courtComplex");
        form.put("est_code", selection.complexValue());
        form.put("court", selection.courtValue());
        // The form's date picker writes month/day/year, e.g. 11/5/2026
        form.put("date", date.getMonthValue() + "/" + date.getDayOfMonth() + "/" + date.getYear());
        form.put("cause_type", "cri".equals(selection.kind()) ? "3" : "2");
        form.put("scid", session.captchaId);
        form.put(session.tokenName, session.tokenValue);
        form.put("siwp_captcha_value", captcha.trim());
        form.put("es_ajax_request", "1");
        form.put("submit", "Search");
        form.put("action", "get_causes");

        JsonNode answer = post(session, form);

        if (answer.path("success").asBoolean()) {
            String html = answer.path("data").asText();

            if (!html.toLowerCase().contains("<table")) {
                String text = Jsoup.parse(html).text();
                return new SubmitResult(false, null, text.isBlank() ? "no cause list returned" : text);
            }
            return new SubmitResult(false, withAllPages(session, form, html), "");
        }

        String message = messageOf(answer.get("data"));
        boolean captchaRejected = message.toLowerCase().contains("captcha");

        if (!captchaRejected) {
            log.info("District site answered without a cause list: {}", abbreviate(message));
        }
        return new SubmitResult(captchaRejected, null, message);
    }

    // A long list is sent in pages: a table with a "load more" button has its next page asked for the way the site's own
    // button does (same form, plus the page number), until no table has one left
    private String withAllPages(SiteSession session, Map<String, String> form, String firstHtml) throws IOException {
        StringBuilder all = new StringBuilder(firstHtml);
        Document first = Jsoup.parseBodyFragment(firstHtml);

        for (Element table : first.select(".distTableContent")) {
            if (table.selectFirst(".loadMoreCasesHolder") == null) continue;

            String nextPage = table.attr("data-next-page");
            String estCode = table.attr("data-est-code");

            for (int i = 0; i < MAX_MORE_PAGES && !nextPage.isBlank(); i++) {
                Map<String, String> more = new LinkedHashMap<>(form);
                more.remove("est_code");
                if (!estCode.isBlank()) more.put("est_code", estCode);
                more.put("page", nextPage);
                more.put("loadmore_clicked", "1");

                JsonNode answer = post(session, more);

                if (!answer.path("success").asBoolean()) {
                    log.warn("District site: page {} of a cause list table was refused: {}", nextPage,
                            messageOf(answer.get("data")));
                    break;
                }

                String html = answer.path("data").asText();
                all.append('\n').append(html);

                Document next = Jsoup.parseBodyFragment(html);
                Element root = next.selectFirst(".distTableContent");
                nextPage = root != null && next.selectFirst(".loadMoreCasesHolder") != null
                        ? root.attr("data-next-page") : "";
            }
        }
        return all.toString();
    }

    private JsonNode post(SiteSession session, Map<String, String> form) throws IOException {
        String encoded = form.entrySet().stream()
                .map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8) + "="
                        + URLEncoder.encode(e.getValue() == null ? "" : e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));

        String origin = URI.create(session.base).getScheme() + "://" + URI.create(session.base).getAuthority();

        HttpResponse<String> response = send(session.http, browserHeaders(HttpRequest.newBuilder(
                        URI.create(session.base + "wp-admin/admin-ajax.php")))
                .header("Accept", "application/json, text/javascript, */*; q=0.01")
                .header("Origin", origin)
                .header("Referer", session.pageUrl)
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                .timeout(Duration.ofSeconds(40))
                .POST(HttpRequest.BodyPublishers.ofString(encoded))
                .build());

        if (response.statusCode() == 429) {
            throw new IOException("the district site asked us to slow down (HTTP 429)");
        }
        if (response.statusCode() != 200) {
            throw new IOException("the district site answered HTTP " + response.statusCode() + ": " + abbreviate(response.body()));
        }

        JsonNode node;

        try {
            node = mapper.readTree(response.body());
        } catch (IOException e) {
            node = null;
        }

        if (node == null || !node.isObject()) {
            throw new IOException("the district site answered with something that is not a cause list reply: "
                    + abbreviate(response.body()));
        }
        return node;
    }

    // The site's error text: a JSON string like {"message":"..."}, an object with a message, or plain text
    private String messageOf(JsonNode data) {
        if (data == null || data.isNull()) return "";

        try {
            JsonNode node = data.isTextual() ? mapper.readTree(data.asText()) : data;
            if (node != null && node.has("message")) return Jsoup.parse(node.get("message").asText()).text();
        } catch (IOException ignored) {
        }
        return data.isTextual() ? Jsoup.parse(data.asText()).text() : data.toString();
    }

    private HttpResponse<String> send(HttpClient http, HttpRequest request) throws IOException {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted while waiting for the district site");
        }
    }

    private HttpRequest.Builder browserHeaders(HttpRequest.Builder builder) {
        return builder
                .header("User-Agent", USER_AGENT)
                .header("Accept-Language", "en-US,en;q=0.9");
    }

    private String newCaptchaId() {
        StringBuilder id = new StringBuilder(CAPTCHA_ID_LENGTH);
        for (int i = 0; i < CAPTCHA_ID_LENGTH; i++) id.append(ID_CHARS.charAt(random.nextInt(ID_CHARS.length())));
        return id.toString();
    }

    private static String abbreviate(String text) {
        String flat = text == null ? "" : text.replaceAll("\\s+", " ").trim();
        return flat.length() <= 300 ? flat : flat.substring(0, 300) + "...";
    }
}
