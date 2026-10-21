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
import java.util.ArrayList;
import java.util.List;
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

    // What the case-detail API says about one case, in the words of the Add Case form. Used to fill the form when a
    // case is added by CNR. Dates are ISO text (yyyy-MM-dd), anything eCourts does not give is empty
    //  status      - Pending, Decided or Withdrawn, as the app names them
    //  courtName   - the court as eCourts names it, the app matches it to its own court table
    //  hearingCount / orderCount - how much history will be brought in when the case is saved
    public record CaseDetail(
            String cnr,
            String caseNo,
            String filingDate,
            String status,
            String nextHearing,
            String caseNature,
            String caseType,
            String courtName,
            String state,
            String district,
            String courtNo,
            String judge,
            List<String> petitioners,
            List<String> respondents,
            List<String> petitionerAdvocates,
            List<String> respondentAdvocates,
            String firNo,
            String policeStation,
            int hearingCount,
            int orderCount) {}

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
        return snapshotOf(load(rawCnr));
    }

    // The case in the shape of the Add Case form, for adding a case by CNR. Same errors as fetch
    public CaseDetail lookup(String rawCnr) {

        JsonNode data = load(rawCnr);
        Snapshot snap = snapshotOf(data);

        String status = "Pending";
        String nextHearing = snap.nextHearing() == null ? null : snap.nextHearing().toString();
        if (snap.disposed()) {
            status = snap.withdrawn() ? "Withdrawn" : "Decided";
            nextHearing = null;
        }

        String typeRaw = text(data, "caseTypeRaw");
        String regNo = text(data, "registrationNumber");
        String caseNo = !regNo.isEmpty()
                ? (typeRaw.isEmpty() ? regNo : typeRaw + " " + regNo)
                : text(data, "filingNumber");

        JsonNode fir = data.path("firDetails");
        String firNumber = text(fir, "caseNumber");
        String firYear = text(fir, "year");
        String firNo = firNumber.isEmpty() ? "" : (firYear.isEmpty() ? firNumber : firNumber + "/" + firYear);

        return new CaseDetail(
                normalizeCnr(rawCnr),
                caseNo,
                dateText(parseDate(data.path("filingDate").asText(null))),
                status,
                nextHearing,
                natureOf(data),
                typeRaw.isEmpty() ? text(data, "caseTypeSub") : typeRaw,
                text(data, "courtName"),
                text(data, "state"),
                text(data, "district"),
                text(data, "courtNo"),
                judgeOf(data),
                texts(data.path("petitioners")),
                texts(data.path("respondents")),
                texts(data.path("petitionerAdvocates")),
                texts(data.path("respondentAdvocates")),
                firNo,
                text(fir, "policeStation"),
                snap.hearings().size(),
                snap.orderFiles().size());
    }

    // Checks the CNR and the token, then reads the courtCaseData node. Throws IllegalArgumentException with a
    // message the advocate can read
    private JsonNode load(String rawCnr) {

        String cnr = normalizeCnr(rawCnr);
        if (cnr == null) {
            throw new IllegalArgumentException("Enter the 16-character CNR number");
        }
        if (token.isEmpty()) {
            log.warn("eCourts case fetch skipped: ecourts.api.token is not set (set ECOURTS_API_TOKEN)");
            throw new IllegalArgumentException("Fetching cases from eCourts is not set up on this server");
        }

        JsonNode data = call(cnr);
        if (data == null || data.isMissingNode() || data.isEmpty()) {
            throw new IllegalArgumentException("eCourts has no case with CNR " + cnr);
        }
        return data;
    }

    private Snapshot snapshotOf(JsonNode data) {

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

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? "" : v.asText("").trim();
    }

    private static String dateText(LocalDate d) {
        return d == null ? null : d.toString();
    }

    // Names from an array of strings (or of objects with a name)
    private static List<String> texts(JsonNode array) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : array) {
            String t = n.isObject()
                    ? (n.hasNonNull("name") ? n.path("name").asText("") : n.path("judgeName").asText(""))
                    : n.asText("");
            t = t.trim();
            if (!t.isEmpty() && !out.contains(t)) out.add(t);
        }
        return out;
    }

    // Words that put a case on the criminal side, and words that put it on the civil side
    private static final java.util.regex.Pattern CRIMINAL_WORDS = java.util.regex.Pattern.compile(
            "criminal|\\bcrl\\b|\\bcr\\.?\\s?p\\.?\\s?c\\b|\\bbnss?\\b|\\bipc\\b|\\bbail\\b|challan|sessions|police|\\bfir\\b");
    private static final java.util.regex.Pattern CIVIL_WORDS = java.util.regex.Pattern.compile(
            "civil|\\bcs\\b|matrimon|family|divorce|custody|injunction|consumer|commercial|recovery|"
          + "partition|\\btenan|\\brent\\b|eviction|probate|succession|arbitration|\\bexecution|motor accident|\\bmacp?\\b");

    // Criminal, Civil, or empty when eCourts gives nothing to tell. Looks at the category path, the case type names
    // and the FIR; an empty answer is better than a wrong "Civil", the Add Case form then asks the advocate
    private static String natureOf(JsonNode data) {
        String hay = (text(data, "caseCategoryFacetPath") + " " + text(data, "caseTypeSub") + " "
                + text(data, "caseTypeRaw") + " " + text(data, "caseType")).toLowerCase(Locale.ROOT);

        boolean criminal = CRIMINAL_WORDS.matcher(hay).find();
        boolean civil = CIVIL_WORDS.matcher(hay).find();
        if (criminal && !civil) return "Criminal";
        if (civil && !criminal) return "Civil";

        // A case with an FIR is a criminal case
        JsonNode fir = data.path("firDetails");
        if (!text(fir, "caseNumber").isEmpty() || !text(fir, "policeStation").isEmpty()) return "Criminal";

        return criminal ? "Criminal" : "";
    }

    // The judge named for the case: the listed judge, else the one on the latest hearing that names one
    private static String judgeOf(JsonNode data) {
        List<String> listed = texts(data.path("judges"));
        if (!listed.isEmpty()) return listed.get(listed.size() - 1);

        String judge = "";
        for (JsonNode row : data.path("historyOfCaseHearings")) {
            String j = row.path("judge").asText("").trim();
            if (!j.isEmpty()) judge = j;
        }
        return judge;
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
