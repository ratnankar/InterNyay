package com.internyay.scraper;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
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
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Component
public class DistrictPortalClient {

    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
    // Most specific first: the hidden form field the portal's own scripts read, then a script variable, then any link
    private static final List<Pattern> TOKENS = List.of(
            Pattern.compile("<input[^>]*id=[\"']app_token[\"'][^>]*value=[\"']([A-Za-z0-9]{16,})[\"']", Pattern.CASE_INSENSITIVE),
            Pattern.compile("<input[^>]*value=[\"']([A-Za-z0-9]{16,})[\"'][^>]*id=[\"']app_token[\"']", Pattern.CASE_INSENSITIVE),
            Pattern.compile("app_token\\s*[=:]\\s*[\"']([A-Za-z0-9]{16,})[\"']"),
            Pattern.compile("app_token=([A-Fa-f0-9]{16,})"));
    // The portal's components.js defines `var delimeter="<value>"` and sends it under rotating header names
    // (`"delimeter": delimeter, "X7trgfq": delimeter`); both the names and the value change between releases
    private static final Pattern SCRIPT_SRC = Pattern.compile("src=[\"']([^\"']*components\\.js[^\"']*)[\"']");
    private static final Pattern GUARD_VALUE = Pattern.compile("var\\s+delimeter\\s*=\\s*[\"']([^\"']+)[\"']");
    private static final Pattern GUARD_NAME = Pattern.compile("[\"']([A-Za-z0-9_-]+)[\"']\\s*:\\s*delimeter\\b");
    private static final DateTimeFormatter PORTAL_DATE = DateTimeFormatter.ofPattern("dd-MM-yyyy");

    public record Option(String value, String text) {}

    public record Selection(String stateCode, String districtCode, String complexCode,
                            String establishmentCode, String courtCode, String courtText, String kind) {}

    public record SubmitResult(boolean captchaRejected, String html, String message) {}

    public static final class PortalSession {
        private HttpClient http;
        private String appToken;
        private Map<String, String> guards = Map.of();
        // The portal page the session was opened on (its "?p=" value); the portal checks it as the Referer
        private String page = "cause_list/index";
        // What was read from the portal script (guard names and every value found), kept for the log when the session turns out dead
        private String guardNote = "";

        private PortalSession(HttpClient http, String appToken) {
            this.http = http;
            this.appToken = appToken;
        }
    }

    // After this many HTTP 405 answers in a row the portal is treated as blocking us and all calls pause for a while
    private static final int BLOCK_AFTER = 3;
    private static final long BLOCK_PAUSE_MS = 5 * 60 * 1000L;
    private final AtomicInteger consecutive405 = new AtomicInteger();
    private final AtomicLong blockedUntil = new AtomicLong();

    private final ObjectMapper mapper = new ObjectMapper();
    private final String baseUrl;
    private final String districtsPath;
    private final String complexesPath;
    private final String establishmentsPath;
    private final String courtsPath;
    private final String submitPath;
    private final String defaultGuard;

    public DistrictPortalClient(
            @Value("${causelist.district.base-url:https://services.ecourts.gov.in/ecourtindia_v6/}") String baseUrl,
            @Value("${causelist.district.path.districts:casestatus/fillDistrict}") String districtsPath,
            @Value("${causelist.district.path.complexes:casestatus/fillcomplex}") String complexesPath,
            @Value("${causelist.district.path.establishments:casestatus/fillCourtEstablishment}") String establishmentsPath,
            @Value("${causelist.district.path.courts:cause_list/fillCauseList}") String courtsPath,
            @Value("${causelist.district.path.submit:cause_list/submitCauseList}") String submitPath,
            @Value("${causelist.district.guard-header-value:mnbcvb54}") String defaultGuard) {
        this.defaultGuard = defaultGuard;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        this.districtsPath = districtsPath;
        this.complexesPath = complexesPath;
        this.establishmentsPath = establishmentsPath;
        this.courtsPath = courtsPath;
        this.submitPath = submitPath;
    }

    public PortalSession open() throws IOException {
        return open("cause_list/index");
    }

    // A session on another page of the portal, e.g. "cnr_status/index" for the case status by CNR
    public PortalSession open(String page) throws IOException {
        PortalSession session = new PortalSession(null, null);
        session.page = page;
        renew(session);
        return session;
    }

    // Starts a fresh browser-like session (new cookies, new token); also used to recover from "Invalid Request"
    private void renew(PortalSession session) throws IOException {
        CookieManager cookies = new CookieManager();

        HttpClient http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .cookieHandler(cookies)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(15))
                .build();

        String page = text(send(http, browserHeaders(HttpRequest.newBuilder(URI.create(baseUrl + "?p=" + session.page)))
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .header("Sec-Fetch-Dest", "document")
                .header("Sec-Fetch-Mode", "navigate")
                .header("Sec-Fetch-Site", "none")
                .header("Upgrade-Insecure-Requests", "1")
                .timeout(Duration.ofSeconds(30))
                .GET()
                .build()));

        String token = null;
        int source = -1;

        for (int i = 0; i < TOKENS.size() && token == null; i++) {
            Matcher matcher = TOKENS.get(i).matcher(page);

            if (matcher.find()) {
                token = matcher.group(1);
                source = i;
            }
        }

        if (token == null) {
            log.warn("District portal page has no app token ({} chars): {}", page.length(), abbreviate(page));
            throw new IOException("portal page did not contain an app token");
        }

        log.info("District portal session opened: token pattern #{}, {} chars, cookies {}", source, token.length(),
                cookies.getCookieStore().getCookies().stream().map(c -> c.getName()).collect(Collectors.toList()));
        session.guards = guardHeaders(http, page, session.page, session);
        session.http = http;
        session.appToken = token;
    }

    private Map<String, String> guardHeaders(HttpClient http, String page, String portalPage) {
        return guardHeaders(http, page, portalPage, null);
    }

    private Map<String, String> guardHeaders(HttpClient http, String page, String portalPage, PortalSession session) {
        Map<String, String> headers = new LinkedHashMap<>();
        String guardNote = "";

        try {
            Matcher src = SCRIPT_SRC.matcher(page);

            if (src.find()) {
                String script = text(send(http, browserHeaders(HttpRequest.newBuilder(
                        URI.create(baseUrl).resolve(src.group(1))))
                        .header("Accept", "*/*")
                        .header("Referer", baseUrl + "?p=" + portalPage)
                        .timeout(Duration.ofSeconds(30))
                        .GET()
                        .build()));

                Matcher value = GUARD_VALUE.matcher(script);
                List<String> values = new ArrayList<>();
                while (value.find()) values.add(value.group(1));

                if (!values.isEmpty()) {
                    // Some script variants hold more than one `var delimeter` (an earlier one is overwritten later):
                    // the last assignment is the one the page's own code ends up sending
                    String chosen = values.get(values.size() - 1);
                    Matcher name = GUARD_NAME.matcher(script);

                    while (name.find()) {
                        headers.put(name.group(1), chosen);
                    }
                    guardNote = "delimeter assignments=" + values.size() + (values.size() > 1 ? " (using the last)" : "")
                            + ", names=" + headers.keySet() + ", context: " + contextAround(script, "delimeter", 3, 160);
                    if (values.size() > 1) {
                        log.warn("District portal script assigns delimeter {} times, using the last: {}", values.size(), guardNote);
                    }
                } else {
                    guardNote = "no `var delimeter` in script, context: " + contextAround(script, "delimeter", 3, 160);
                }
            }
        } catch (IOException | RuntimeException e) {
            log.warn("District portal script could not be read: {}", e.getMessage());
        }

        if (session != null) session.guardNote = guardNote;

        if (headers.isEmpty()) {
            log.warn("District portal guard headers not found in its scripts, using the configured value");
            headers.put("delimeter", defaultGuard);
            headers.put("qyuiwer34", defaultGuard);
        } else {
            log.info("District portal guard headers read from its script: {}", headers.keySet());
        }
        return headers;
    }

    // Up to `max` snippets of the text around each occurrence of `needle`, for the diagnostic log
    private static String contextAround(String text, String needle, int max, int radius) {
        StringBuilder out = new StringBuilder();
        int from = 0;
        for (int i = 0; i < max; i++) {
            int at = text.indexOf(needle, from);
            if (at < 0) break;
            int start = Math.max(0, at - radius), end = Math.min(text.length(), at + needle.length() + radius);
            out.append('[').append(text, start, end).append("] ");
            from = at + needle.length();
        }
        return out.toString().replaceAll("\\s+", " ").trim();
    }

    public String guardNote(PortalSession session) {
        return session.guardNote;
    }

    private HttpRequest.Builder browserHeaders(HttpRequest.Builder builder) {
        return builder
                .header("User-Agent", USER_AGENT)
                .header("Accept-Language", "en-US,en;q=0.9");
    }

    public List<Option> districts(PortalSession session, String stateCode) throws IOException {
        return options(session, districtsPath, Map.of("state_code", stateCode));
    }

    public List<Option> complexes(PortalSession session, String stateCode, String districtCode) throws IOException {
        return options(session, complexesPath, Map.of("state_code", stateCode, "dist_code", districtCode));
    }

    public List<Option> establishments(PortalSession session, String stateCode, String districtCode,
                                       String complexCode) throws IOException {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("state_code", stateCode);
        form.put("dist_code", districtCode);
        form.put("court_complex_code", complexCode);
        return options(session, establishmentsPath, form);
    }

    public List<Option> courts(PortalSession session, String stateCode, String districtCode,
                               String complexCode, String establishmentCode) throws IOException {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("state_code", stateCode);
        form.put("dist_code", districtCode);
        form.put("court_complex_code", complexCode);
        form.put("est_code", establishmentCode);
        form.put("search_act", "");
        return options(session, courtsPath, form);
    }

    // One harmless request (the list of districts) before the first CAPTCHA is fetched. The portal settles the cookies and
    // the page token of a session on its first ajax call; a CAPTCHA fetched before that call can belong to the session as
    // it was before, which made the first answer of every lookup come back as wrong. Failures are ignored: the CAPTCHA is
    // fetched either way
    // Returns false when the portal answered with an empty list of districts: in the logs every session that did this
    // later had its typed CAPTCHA silently refused (the portal sent only a new picture), so such a session is useless
    public boolean warmUp(PortalSession session, String stateCode) {
        try {
            boolean usable = !districts(session, stateCode).isEmpty();
            if (!usable) log.warn("Dead portal session (no districts). Guard headers {}; script: {}", session.guards.keySet(), session.guardNote);
            return usable;
        } catch (IOException | RuntimeException e) {
            log.info("Portal warm-up request failed, continuing: {}", e.getMessage());
            return true;
        }
    }

    public byte[] captcha(PortalSession session) throws IOException {
        checkNotPaused();
        String url = baseUrl + "vendor/securimage/securimage_show.php?" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);

        HttpResponse<byte[]> response = session.http.sendAsync(
                browserHeaders(HttpRequest.newBuilder(URI.create(url)))
                        .header("Accept", "image/avif,image/webp,image/png,image/*,*/*;q=0.8")
                        .header("Referer", baseUrl + "?p=" + session.page)
                        .timeout(Duration.ofSeconds(30))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofByteArray()).orTimeout(40, java.util.concurrent.TimeUnit.SECONDS).join();

        if (response.statusCode() != 200 || response.body().length == 0) {
            throw new IOException("CAPTCHA image request answered HTTP " + response.statusCode());
        }
        return response.body();
    }

    public SubmitResult submit(PortalSession session, Selection selection, LocalDate date, String captcha) throws IOException {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("CL_court_no", selection.courtCode());
        form.put("causelist_date", date.format(PORTAL_DATE));
        form.put("cause_list_captcha_code", captcha.trim());
        form.put("court_name_txt", selection.courtText());
        form.put("state_code", selection.stateCode());
        form.put("dist_code", selection.districtCode());
        form.put("court_complex_code", selection.complexCode());
        form.put("est_code", selection.establishmentCode());
        form.put("cicri", selection.kind());
        form.put("selprevdays", "0");

        String body = post(session, submitPath, form);
        List<String> strings = strings(body);

        String html = strings.stream().filter(s -> s.toLowerCase().contains("<table")).findFirst().orElse(null);

        if (html != null) {
            return new SubmitResult(false, html, "");
        }

        String message = strings.stream()
                .filter(s -> !s.isBlank() && !s.matches("[A-Fa-f0-9]{16,}"))
                .filter(s -> !s.contains("captcha_image") && !s.toLowerCase().contains("<audio"))
                .map(s -> Jsoup.parse(s).text())
                .collect(Collectors.joining(" | "));

        boolean captchaRejected = message.toLowerCase().contains("captcha");

        if (!captchaRejected) {
            log.warn("District portal answered without a cause list table: {}", abbreviate(body));
        }
        return new SubmitResult(captchaRejected, null, message);
    }

    // Case status by CNR: sends the CNR and the typed CAPTCHA. On success `html` holds the case page
    public SubmitResult searchCnr(PortalSession session, String searchPath, String cnr, String captcha) throws IOException {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("cino", cnr);
        form.put("fcaptcha_code", captcha.trim());

        String body = post(session, searchPath, form);
        List<String> strings = strings(body);

        // The case page is the answer that carries the case tables
        String html = strings.stream()
                .filter(s -> s.toLowerCase().contains("<table"))
                .findFirst().orElse(null);
        if (html != null) return new SubmitResult(false, html, "");

        String message = strings.stream()
                .filter(s -> !s.isBlank() && !s.matches("[A-Fa-f0-9]{16,}"))
                .filter(s -> !s.contains("captcha_image") && !s.toLowerCase().contains("<audio"))
                .map(s -> Jsoup.parse(s).text())
                .filter(s -> !s.isBlank())
                .collect(Collectors.joining(" | "));

        // A refused CAPTCHA is sometimes answered with no text at all, only a new CAPTCHA picture next to an empty error
        // line; that is not "no such case" but "type the new CAPTCHA", so it counts as a rejected one
        boolean newCaptchaOffered = message.isBlank() && body.contains("captcha_image");
        boolean captchaRejected = message.toLowerCase().contains("captcha") || newCaptchaOffered;
        if (captchaRejected) {
            // Diagnostic: what the portal really said (token and image data left out)
            try {
                JsonNode n = mapper.readTree(body);
                n.fields().forEachRemaining(f -> {
                    if ("app_token".equals(f.getKey())) return;
                    String v = f.getValue().asText();
                    log.info("CNR reply field {} = {}", f.getKey(), v.contains("base64") ? "<image>" : abbreviate(v));
                });
            } catch (IOException e) {
                log.info("CNR reply (not JSON): {}", abbreviate(body));
            }
        }
        if (!captchaRejected) {
            log.warn("Portal answered the CNR search without a case page: {}", abbreviate(body));
        } else if (newCaptchaOffered) {
            log.info("Portal gave a new CAPTCHA for the CNR search (the typed one was not accepted)");
        }
        return new SubmitResult(captchaRejected, null, message);
    }

    // The PDF behind a "copy of order" link. `argument` is what the link's displayPdf('...') call holds: a query string
    // of fields that the portal's display_pdf page turns into the file's path. Returns null when no PDF came back
    public byte[] orderPdf(PortalSession session, String displayPath, String argument) throws IOException {
        checkNotPaused();
        Map<String, String> form = new LinkedHashMap<>();
        for (String pair : argument.split("&")) {
            int eq = pair.indexOf('=');
            if (eq <= 0) continue;
            form.put(java.net.URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                    java.net.URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
        }

        String body = post(session, displayPath, form);

        // The answer names the file (JSON field "order"); any string that points to a pdf will do
        String path = strings(body).stream()
                .map(String::trim)
                .filter(v -> v.toLowerCase().contains(".pdf"))
                .findFirst().orElse(null);
        if (path == null) {
            log.warn("Portal did not name an order file: {}", abbreviate(body));
            return null;
        }

        // The file may be given inside an anchor or as a plain path
        Matcher href = Pattern.compile("(?:href|src|data)=[\"']([^\"']+\\.pdf[^\"']*)[\"']", Pattern.CASE_INSENSITIVE).matcher(path);
        String target = href.find() ? href.group(1) : path;

        HttpResponse<byte[]> response = session.http.sendAsync(
                browserHeaders(HttpRequest.newBuilder(URI.create(baseUrl).resolve(target)))
                        .header("Accept", "application/pdf,*/*;q=0.8")
                        .header("Referer", baseUrl + "?p=" + session.page)
                        .timeout(Duration.ofSeconds(60))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofByteArray()).orTimeout(70, java.util.concurrent.TimeUnit.SECONDS).join();

        byte[] pdf = response.body();
        boolean isPdf = response.statusCode() == 200 && pdf.length > 4 && pdf[0] == '%' && pdf[1] == 'P' && pdf[2] == 'D' && pdf[3] == 'F';
        if (!isPdf) {
            log.warn("Order file {} was not a PDF (HTTP {}, {} bytes): {}", target, response.statusCode(), pdf.length,
                    abbreviate(new String(pdf, StandardCharsets.UTF_8).replaceAll("(?s)<(script|style).*?</\\1>", " ").replaceAll("<[^>]*>", " ").replaceAll("\\s+", " ").trim()));
            return null;
        }
        return pdf;
    }

    private List<Option> options(PortalSession session, String path, Map<String, String> form) throws IOException {
        String body = post(session, path, form);

        if (isInvalidRequest(body)) {
            log.warn("Portal {} rejected the session token, opening a fresh session and retrying once", path);
            renew(session);
            body = post(session, path, form);
        }

        String html = strings(body).stream()
                .filter(s -> s.toLowerCase().contains("<option"))
                .findFirst()
                .orElse(body);

        List<Option> options = new ArrayList<>();

        for (Element option : Jsoup.parseBodyFragment(html).select("option")) {
            String value = option.attr("value").trim();

            if (!value.isEmpty()) {
                options.add(new Option(value, option.text().trim()));
            }
        }

        if (options.isEmpty()) {
            log.warn("Portal {} returned no options: {}", path, abbreviate(body));
        }
        return options;
    }

    private String post(PortalSession session, String path, Map<String, String> form) throws IOException {
        Map<String, String> all = new LinkedHashMap<>(form);
        all.put("ajax_req", "true");
        all.put("app_token", session.appToken);

        String encoded = all.entrySet().stream()
                .map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8) + "="
                        + URLEncoder.encode(e.getValue() == null ? "" : e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));

        HttpRequest.Builder request = browserHeaders(HttpRequest.newBuilder(URI.create(baseUrl + "?p=" + path)));
        session.guards.forEach(request::header);

        String body = text(send(session.http, request
                .header("Accept", "application/json, text/javascript, */*; q=0.01")
                .header("Origin", origin())
                .header("Sec-Fetch-Dest", "empty")
                .header("Sec-Fetch-Mode", "cors")
                .header("Sec-Fetch-Site", "same-origin")
                .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Referer", origin() + "/")
                .timeout(Duration.ofSeconds(40))
                .POST(HttpRequest.BodyPublishers.ofString(encoded))
                .build()));

        try {
            JsonNode node = mapper.readTree(body);
            if (node != null && node.has("app_token") && node.get("app_token").isTextual()
                    && !node.get("app_token").asText().isBlank()) {
                session.appToken = node.get("app_token").asText();
            }
        } catch (IOException ignored) {
        }
        return body;
    }

    private void checkNotPaused() throws IOException {
        long wait = blockedUntil.get() - System.currentTimeMillis();
        if (wait > 0) throw new IOException("portal calls paused for " + (wait / 1000) + "s after repeated HTTP 405 answers");
    }

    private static boolean isInvalidRequest(String body) {
        return body != null && body.toLowerCase().contains("invalid request");
    }

    private String origin() {
        URI uri = URI.create(baseUrl);
        return uri.getScheme() + "://" + uri.getAuthority();
    }

    private List<String> strings(String body) {
        List<String> values = new ArrayList<>();

        try {
            JsonNode node = mapper.readTree(body);

            if (node != null && node.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
                while (fields.hasNext()) {
                    JsonNode value = fields.next().getValue();
                    if (value.isTextual()) {
                        values.add(value.asText());
                    }
                }
                return values;
            }
        } catch (IOException ignored) {
        }

        values.add(body);
        return values;
    }

    private HttpResponse<byte[]> send(HttpClient http, HttpRequest request) throws IOException {
        long wait = blockedUntil.get() - System.currentTimeMillis();
        if (wait > 0) {
            throw new IOException("portal calls paused for " + (wait / 1000) + "s after repeated HTTP 405 answers");
        }
        HttpResponse<byte[]> response = null;

        // The portal sometimes closes a connection without answering ("header parser received no bytes"): try again
        for (int attempt = 1; response == null; attempt++) {
            try {
                response = http.sendAsync(request, HttpResponse.BodyHandlers.ofByteArray())
                        .orTimeout(60, java.util.concurrent.TimeUnit.SECONDS).join();
            } catch (java.util.concurrent.CompletionException e) {
                if (attempt >= 3 || !(e.getCause() instanceof IOException)) {
                    throw new IOException(e.getCause() == null ? e.getMessage() : e.getCause().getMessage(), e);
                }
                log.warn("District portal request failed ({}), retrying", e.getCause().getMessage());

                try {
                    Thread.sleep(500L * attempt);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IOException("interrupted", interrupted);
                }
            }
        }

        if (response.statusCode() >= 400) {
            String body = abbreviate(new String(response.body(), StandardCharsets.UTF_8));
            log.warn("Portal answered HTTP {} to {} {} (Server: {}, Allow: {}, Content-Type: {}): {}",
                    response.statusCode(), request.method(), request.uri().getPath() + (request.uri().getQuery() == null ? "" : "?" + request.uri().getQuery()),
                    response.headers().firstValue("Server").orElse("-"), response.headers().firstValue("Allow").orElse("-"),
                    response.headers().firstValue("Content-Type").orElse("-"), body);

            if (response.statusCode() == 405 && consecutive405.incrementAndGet() >= BLOCK_AFTER) {
                blockedUntil.set(System.currentTimeMillis() + BLOCK_PAUSE_MS);
                consecutive405.set(0);
                log.warn("Portal answered HTTP 405 {} times in a row: pausing all portal calls for {} minutes", BLOCK_AFTER, BLOCK_PAUSE_MS / 60000);
            }
            throw new IOException("portal answered HTTP " + response.statusCode());
        }
        consecutive405.set(0);
        return response;
    }

    private static String text(HttpResponse<byte[]> response) {
        return new String(response.body(), StandardCharsets.UTF_8);
    }

    private static String abbreviate(String body) {
        String flat = body == null ? "" : body.replaceAll("\\s+", " ").trim();
        return flat.length() > 300 ? flat.substring(0, 300) + "…" : flat;
    }
}