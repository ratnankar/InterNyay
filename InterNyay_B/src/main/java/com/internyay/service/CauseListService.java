package com.internyay.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.internyay.entity.Case;
import com.internyay.repository.CaseRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

// Pulls cause list numbers for the advocate's cases from the eCourts partner API, using each case's CNR
@Service
@Slf4j
public class CauseListService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final String BATCH_PATH = "/api/partner/causelist/cnr/batch";

    private static final Pattern CNR_FORMAT = Pattern.compile("[A-Z0-9]{16}");

    private final CaseRepository caseRepo;
    private final CourtService courtService;
    private final RestClient http;
    private final String token;
    private final int batchSize;

    public CauseListService(
            CaseRepository caseRepo,
            CourtService courtService,
            RestClient.Builder builder,
            @Value("${ecourts.api.base-url:https://webapi.ecourtsindia.com}") String baseUrl,
            @Value("${ecourts.api.token:}") String token,
            @Value("${ecourts.api.batch-size:50}") int batchSize) {

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(30_000);

        this.caseRepo = caseRepo;
        this.courtService = courtService;
        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.token = token == null ? "" : token.trim();
        this.batchSize = Math.max(1, batchSize);
    }

    // Summary of one run: date, cases with a CNR, cause list numbers saved
    public record Result(LocalDate hearingDate, int casesWithCnr, int causeListNosSaved) {}

    // Everything for tomorrow's hearings
    public Result fetchForTomorrow() {
        return fetchFor(LocalDate.now(IST).plusDays(1));
    }

    // Only cases that still have no cause list number, used by the startup catch-up
    public Result fetchMissingForTomorrow() {
        return fetchFor(LocalDate.now(IST).plusDays(1), true);
    }

    // Same for today, used by the startup catch-up
    public Result fetchMissingForToday() {
        return fetchFor(LocalDate.now(IST), true);
    }

    // Fetch for any date
    public Result fetchFor(LocalDate hearingDate) {
        return fetchFor(hearingDate, false);
    }

    // Does nothing when no API token is configured, otherwise sends the CNRs in batches
    public Result fetchFor(LocalDate hearingDate, boolean onlyMissing) {

        if (token.isEmpty()) {
            log.warn("Cause-list fetch skipped: ecourts.api.token is not set "
                    + "(set ECOURTS_API_TOKEN or put it in local-secrets.properties)");
            return new Result(hearingDate, 0, 0);
        }

        Map<String, List<Long>> idsByCnr = new LinkedHashMap<>();

        // No cause list is fetched for a Juvenile Justice Board, even if an old case there still holds a CNR
        java.util.function.Predicate<Case> juvenile = courtService.juvenileBoardCases();

        for (Case c : caseRepo.findByNextHearingAndCnrNoIsNotNull(hearingDate)) {

            if (juvenile.test(c)) continue;

            if (onlyMissing && c.getCauseListNo() != null && hearingDate.equals(c.getListingDate())) continue;

            String cnr = normalizeCnr(c.getCnrNo());

            if (cnr == null) {
                log.debug("Case {} skipped: CNR '{}' is not a 16-character CNR", c.getId(), c.getCnrNo());
                continue;
            }
            idsByCnr.computeIfAbsent(cnr, k -> new ArrayList<>()).add(c.getId());
        }

        if (idsByCnr.isEmpty()) {
            log.info("Cause-list fetch for {}: no cases with a valid CNR still need a Cause List No. that day", hearingDate);
            return new Result(hearingDate, 0, 0);
        }

        List<String> cnrs = new ArrayList<>(idsByCnr.keySet());
        int saved = 0;

        for (int from = 0; from < cnrs.size(); from += batchSize) {
            List<String> batch = cnrs.subList(from, Math.min(from + batchSize, cnrs.size()));

            for (Map.Entry<String, Integer> found : queryBatch(batch, hearingDate).entrySet()) {
                saved += caseRepo.saveCauseListNo(found.getValue(), hearingDate, idsByCnr.get(found.getKey()));
            }
        }

        log.info("Cause-list fetch for {}: {} CNR(s) asked, Cause List No. saved on {} case(s)",
                hearingDate, cnrs.size(), saved);

        return new Result(hearingDate, cnrs.size(), saved);
    }

    // One API call for a batch of CNRs, returns CNR -> cause list number
    private Map<String, Integer> queryBatch(List<String> batch, LocalDate hearingDate) {

        JsonNode root;

        try {
            root = http.post()
                    .uri(BATCH_PATH)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("cnrs", batch))
                    .retrieve()
                    .body(JsonNode.class);

        } catch (RestClientResponseException e) {
            log.error("Cause-list API answered HTTP {} for a batch of {} CNR(s): {}",
                    e.getStatusCode().value(), batch.size(), abbreviate(e.getResponseBodyAsString()));
            return Map.of();

        } catch (RestClientException e) {
            log.error("Cause-list API call failed for a batch of {} CNR(s): {}", batch.size(), e.getMessage());
            return Map.of();
        }

        Map<String, Integer> found = new HashMap<>();

        if (root == null) return found;

        for (JsonNode item : root.path("data")) {

            String cnr = normalizeCnr(item.path("cnr").asText(null));
            if (cnr == null || !batch.contains(cnr)) continue;

            JsonNode next = item.path("nextListing");

            if (!item.path("hasCauselist").asBoolean(false) || !next.isObject()) {
                log.debug("{}: not in a cause list yet", cnr);
                continue;
            }

            LocalDate listedFor = parseDate(next.path("date").asText(null));

            if (!hearingDate.equals(listedFor)) {
                log.debug("{}: next listing is for {}, not {} — ignored", cnr, listedFor, hearingDate);
                continue;
            }

            Integer causeListNo = readInt(next.path("listingNo"));

            if (causeListNo == null) {
                log.debug("{}: listed on {} but no Cause List No. given", cnr, hearingDate);
                continue;
            }

            found.put(cnr, causeListNo);
        }

        return found;
    }

    // Upper case, no spaces or dashes, null when it isn't a valid CNR
    private static String normalizeCnr(String raw) {
        if (raw == null) return null;

        String cnr = raw.trim().toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
        return CNR_FORMAT.matcher(cnr).matches() ? cnr : null;
    }

    // Takes the date part of an ISO date-time string
    private static LocalDate parseDate(String text) {
        if (text == null || text.length() < 10) return null;

        try {
            return LocalDate.parse(text.substring(0, 10));
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    // API returns numbers either as numbers or as text
    private static Integer readInt(JsonNode node) {
        if (node.isNumber()) return node.asInt();

        if (node.isTextual()) {
            try {
                return Integer.valueOf(node.asText().trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    // Short version of an error body for the log
    private static String abbreviate(String body) {
        if (body == null) return "";
        String flat = body.replaceAll("\\s+", " ").trim();
        return flat.length() > 300 ? flat.substring(0, 300) + "…" : flat;
    }
}
