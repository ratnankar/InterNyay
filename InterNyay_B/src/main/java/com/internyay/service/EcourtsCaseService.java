package com.internyay.service;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;

// Reads a case from the eCourts case-detail API: its status, next hearing, past hearing dates and order files
@Service
@Slf4j
public class EcourtsCaseService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final String CASE_PATH = "/api/partner/case/{cnr}";
    private static final Pattern CNR_FORMAT = Pattern.compile("[A-Z0-9]{16}");

    // What the case-detail API says about one case
    //  hearings   - every date the case was heard (up to today) with the judge, oldest first
    //  orderFiles - order date to eCourts file name (order-N.pdf), interim orders and judgments
    public record Snapshot(
            String caseStatus,
            String disposalType,
            LocalDate nextHearing,
            LocalDate decisionDate,
            TreeMap<LocalDate, String> hearings,
            Map<LocalDate, String> orderFiles) {

        public boolean disposed() { return "DISPOSED".equalsIgnoreCase(caseStatus); }

        public boolean withdrawn() {
            return disposalType != null && disposalType.toUpperCase(Locale.ROOT).contains("WITHDRAWN");
        }
    }

    private final RestClient http;
    private final String token;

    public EcourtsCaseService(
            RestClient.Builder builder,
            @Value("${ecourts.api.base-url:https://webapi.ecourtsindia.com}") String baseUrl,
            @Value("${ecourts.api.token:}") String token) {

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(30_000);

        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.token = token == null ? "" : token.trim();
    }

    // Full snapshot of the case. Throws IllegalArgumentException with a message the advocate can read
    public Snapshot fetch(String rawCnr) {

        String cnr = normalizeCnr(rawCnr);
        if (cnr == null) {
            throw new IllegalArgumentException("Enter the 16-character CNR number to add an old case");
        }
        if (token.isEmpty()) {
            log.warn("eCourts case fetch skipped: ecourts.api.token is not set (set ECOURTS_API_TOKEN)");
            throw new IllegalArgumentException("Fetching cases from eCourts is not set up on this server");
        }

        JsonNode data = call(cnr);
        if (data == null || data.isMissingNode() || data.isEmpty()) {
            throw new IllegalArgumentException("eCourts has no case with CNR " + cnr);
        }

        LocalDate today = LocalDate.now(IST);

        // Dates the case was heard: the "business on" date of every history row, plus every order date
        TreeMap<LocalDate, String> hearings = new TreeMap<>();
        for (JsonNode row : data.path("historyOfCaseHearings")) {
            LocalDate d = parseDate(row.path("businessOnDate").asText(null));
            if (d != null && !d.isAfter(today)) {
                String judge = row.path("judge").asText("").trim();
                hearings.merge(d, judge, (a, b) -> a.isBlank() ? b : a);
            }
        }
        for (JsonNode row : data.path("businessOnDateEntries")) {
            LocalDate d = parseDate(row.path("date").asText(null));
            if (d != null && !d.isAfter(today)) {
                String judge = row.path("courtOf").asText("").trim();
                hearings.merge(d, judge, (a, b) -> a.isBlank() ? b : a);
            }
        }

        Map<LocalDate, String> orderFiles = new TreeMap<>();
        collectOrders(data.path("interimOrders"), orderFiles);
        collectOrders(data.path("judgmentOrders"), orderFiles);
        orderFiles.keySet().stream().filter(d -> !d.isAfter(today)).forEach(d -> hearings.putIfAbsent(d, ""));

        return new Snapshot(
                data.path("caseStatus").asText(null),
                data.path("disposalType").asText(null),
                parseDate(data.path("nextHearingDate").asText(null)),
                parseDate(data.path("decisionDate").asText(null)),
                hearings,
                orderFiles);
    }

    // order date to order-N.pdf for every interim order and judgment of a courtCaseData node, the first order of a date wins
    public static Map<LocalDate, String> orderFilesOf(JsonNode data) {
        Map<LocalDate, String> orderFiles = new TreeMap<>();
        collectOrders(data.path("interimOrders"), orderFiles);
        collectOrders(data.path("judgmentOrders"), orderFiles);
        return orderFiles;
    }

    private static void collectOrders(JsonNode orders, Map<LocalDate, String> into) {
        for (JsonNode o : orders) {
            LocalDate d = parseDate(o.path("orderDate").asText(null));
            String file = o.path("orderUrl").asText("").trim();
            if (d != null && !file.isEmpty()) into.putIfAbsent(d, file);
        }
    }

    // The courtCaseData node, or null when the call failed
    private JsonNode call(String cnr) {
        try {
            JsonNode root = http.get()
                    .uri(CASE_PATH, cnr)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .retrieve()
                    .body(JsonNode.class);

            return root == null ? null : root.path("data").path("courtCaseData");

        } catch (RestClientResponseException e) {
            log.error("Case-detail API answered HTTP {} for CNR {}: {}",
                    e.getStatusCode().value(), cnr, abbreviate(e.getResponseBodyAsString()));
            if (e.getStatusCode().value() == 404) {
                throw new IllegalArgumentException("eCourts has no case with CNR " + cnr);
            }
            throw new IllegalArgumentException("Could not read the case from eCourts right now, try again in a moment");

        } catch (RestClientException e) {
            log.error("Case-detail API call failed for CNR {}: {}", cnr, e.getMessage());
            throw new IllegalArgumentException("Could not reach eCourts right now, try again in a moment");
        }
    }

    // Upper case, no spaces or dashes, null when invalid
    public static String normalizeCnr(String raw) {
        if (raw == null) return null;
        String cnr = raw.trim().toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
        return CNR_FORMAT.matcher(cnr).matches() ? cnr : null;
    }

    // Takes the date part of an ISO date or date-time string
    private static LocalDate parseDate(String text) {
        if (text == null || text.length() < 10) return null;
        try {
            return LocalDate.parse(text.substring(0, 10));
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static String abbreviate(String body) {
        if (body == null) return "";
        String flat = body.replaceAll("\\s+", " ").trim();
        return flat.length() > 300 ? flat.substring(0, 300) + "…" : flat;
    }
}
