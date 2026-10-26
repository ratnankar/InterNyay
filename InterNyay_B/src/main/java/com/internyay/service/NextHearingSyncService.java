package com.internyay.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.internyay.entity.Case;
import com.internyay.entity.Hearing;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.HearingRepository;
import com.internyay.util.CaseStatuses;
import com.internyay.util.OrderCutoff;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

// At 6 PM on a hearing date, reads the case from the eCourts case-detail API using its CNR: moves the next hearing
// date and, when the API lists an order passed on that hearing date, saves its file name on the hearing so Get order shows.
// A case the API reports as disposed is marked Decided, or Withdrawn when it was dismissed as withdrawn
@Service
@Slf4j
public class NextHearingSyncService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final String CASE_PATH = "/api/partner/case/{cnr}";

    private static final Pattern CNR_FORMAT = Pattern.compile("[A-Z0-9]{16}");

    private final CaseRepository caseRepo;
    private final HearingRepository hearingRepo;
    private final HearingService hearingService;
    private final CourtService courtService;
    private final RestClient http;
    private final String token;

    public NextHearingSyncService(
            CaseRepository caseRepo,
            HearingRepository hearingRepo,
            HearingService hearingService,
            CourtService courtService,
            RestClient.Builder builder,
            @Value("${ecourts.api.base-url:https://webapi.ecourtsindia.com}") String baseUrl,
            @Value("${ecourts.api.token:}") String token) {

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(30_000);

        this.caseRepo = caseRepo;
        this.hearingRepo = hearingRepo;
        this.hearingService = hearingService;
        this.courtService = courtService;
        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.token = token == null ? "" : token.trim();
    }

    // Summary of one run
    public record Result(LocalDate hearingDate, int casesWithCnr, int nextHearingUpdated) {}

    // Sync using today's date
    public Result syncForToday() {
        return syncFor(LocalDate.now(IST));
    }

    // Skipped when no API token is set
    public Result syncFor(LocalDate hearingDate) {

        if (token.isEmpty()) {
            log.warn("Next-hearing sync skipped: ecourts.api.token is not set "
                    + "(set ECOURTS_API_TOKEN or put it in local-secrets.properties)");
            return new Result(hearingDate, 0, 0);
        }

        List<Case> cases = caseRepo.findByNextHearingAndCnrNoIsNotNull(hearingDate);
        int updated = 0;

        java.util.function.Predicate<Case> juvenile = courtService.juvenileBoardCases();

        for (Case c : cases) {
            // Juvenile Justice Board cases are not read from eCourts
            if (juvenile.test(c)) continue;

            String cnr = normalizeCnr(c.getCnrNo());

            if (cnr == null) {
                log.debug("Case {} skipped: CNR '{}' is not a 16-character CNR", c.getId(), c.getCnrNo());
                continue;
            }

            JsonNode data = fetchCaseData(cnr);
            if (data == null) continue;

            saveOrderFile(c, hearingDate, EcourtsCaseService.orderFilesOf(data).get(hearingDate));

            if (closeIfDisposed(c, data, hearingDate)) {
                updated++;
                continue;
            }

            LocalDate fetched = parseDate(data.path("nextHearingDate").asText(null));

            if (fetched == null || fetched.equals(c.getNextHearing())) continue;

            hearingService.keepCauseListNo(c, c.getUser().getId());
            c.setCauseListNo(null);
            c.setListingDate(null);
            c.setNextHearing(fetched);
            caseRepo.save(c);
            hearingService.recordHeard(c, fetched, c.getUser().getId());
            updated++;
        }

        log.info("Next-hearing sync for {}: {} case(s) with a CNR checked, {} Next Hearing date(s) updated",
                hearingDate, cases.size(), updated);

        return new Result(hearingDate, cases.size(), updated);
    }

    // ---- One case, when the advocate asks for it ------------------------------------------------------------------

    public enum SyncStatus {
        // eCourts gave a later date and the case moved to it
        UPDATED,
        // eCourts reports the case disposed: it is now Decided or Withdrawn
        CLOSED,
        // eCourts still shows the old date (or none): nothing changed, ask again later
        NOT_YET,
        // Asked again for the same case within a few minutes: eCourts was not called
        TOO_SOON,
        // Could not be asked (no CNR, not due yet, no token, eCourts error ...)
        UNAVAILABLE
    }

    public record CaseSync(SyncStatus status, String message, LocalDate nextHearing, String caseStatus) {}

    // How long before the same case can be sent to eCourts again (keeps the paid API calls down)
    private static final Duration RECHECK_AFTER = Duration.ofMinutes(10);
    private final Map<Long, Instant> lastAsked = new ConcurrentHashMap<>();

    // The "Update next date" button of a case: from 6 PM on its hearing date (or any later day) the case is read from
    // eCourts and moved to the new date. The date only moves forward, so an API that still shows the old date changes
    // nothing. Only the owner of the case can ask
    public CaseSync syncCase(Long caseId, Long userId) {

        Case c = caseRepo.findById(caseId).orElseThrow(() -> new RuntimeException("Case not found"));
        if (c.getUser() == null || !c.getUser().getId().equals(userId)) throw new RuntimeException("Forbidden");

        LocalDate heard = c.getNextHearing();

        if (CaseStatuses.isClosed(c.getStatus()))
            return unavailable(c, "This case is already closed");
        if (courtService.juvenileBoardCases().test(c))
            return unavailable(c, "Juvenile Justice Board cases are not read from eCourts");

        String cnr = normalizeCnr(c.getCnrNo());
        if (cnr == null)
            return unavailable(c, "Add the 16-character CNR number to this case to check eCourts");
        if (heard == null || !OrderCutoff.passed(heard))
            return unavailable(c, "The next date can be checked from 6 PM on the hearing date");
        if (token.isEmpty())
            return unavailable(c, "Checking eCourts is not set up on this server");

        Instant now = Instant.now();
        lastAsked.values().removeIf(t -> t.plus(Duration.ofHours(1)).isBefore(now));
        Instant last = lastAsked.get(c.getId());
        if (last != null && last.plus(RECHECK_AFTER).isAfter(now)) {
            return new CaseSync(SyncStatus.TOO_SOON,
                    "eCourts was checked a few minutes ago, try again after some time", heard, c.getStatus());
        }
        lastAsked.put(c.getId(), now);

        JsonNode data = fetchCaseData(cnr);
        if (data == null) return unavailable(c, "Could not read the case from eCourts right now, try again later");

        return switch (moveCase(c, data, heard)) {
            case MOVED -> new CaseSync(SyncStatus.UPDATED, "Next hearing date updated", c.getNextHearing(), c.getStatus());
            case CLOSED -> new CaseSync(SyncStatus.CLOSED, "eCourts shows this case as " + c.getStatus(), null, c.getStatus());
            case UNCHANGED -> new CaseSync(SyncStatus.NOT_YET,
                    "eCourts has not given a new date yet, try again later", heard, c.getStatus());
        };
    }

    private static CaseSync unavailable(Case c, String message) {
        return new CaseSync(SyncStatus.UNAVAILABLE, message, c.getNextHearing(), c.getStatus());
    }

    private enum Move { MOVED, CLOSED, UNCHANGED }

    // One case whose hearing date is over: saves the order file of that date, closes the case when eCourts has it
    // disposed, otherwise moves it to the new date when that is later than the passed one
    private Move moveCase(Case c, JsonNode data, LocalDate heard) {

        saveOrderFile(c, heard, EcourtsCaseService.orderFilesOf(data).get(heard));

        if (closeIfDisposed(c, data, heard)) return Move.CLOSED;

        LocalDate fetched = parseDate(data.path("nextHearingDate").asText(null));
        if (fetched == null || !fetched.isAfter(heard)) return Move.UNCHANGED;

        Long userId = c.getUser().getId();
        hearingService.recordHeard(c, heard, userId);
        hearingService.keepCauseListNo(c, userId);
        c.setCauseListNo(null);
        c.setListingDate(null);
        c.setNextHearing(fetched);
        caseRepo.save(c);
        hearingService.recordHeard(c, fetched, userId);
        return Move.MOVED;
    }

    private boolean closeIfDisposed(Case c, JsonNode data, LocalDate hearingDate) {
        if (!"DISPOSED".equalsIgnoreCase(data.path("caseStatus").asText(null))) return false;
        if (CaseStatuses.isClosed(c.getStatus())) return false;

        Long userId = c.getUser().getId();
        boolean withdrawn = data.path("disposalType").asText("").toUpperCase(Locale.ROOT).contains("WITHDRAWN");

        if (withdrawn) {
            hearingService.recordWithdrawn(c, hearingDate, userId);
        } else {
            hearingService.recordHeard(c, hearingDate, userId);
        }

        c.setStatus(withdrawn ? CaseStatuses.WITHDRAWN : CaseStatuses.DECIDED);
        c.setNextHearing(null);
        c.setCauseListNo(null);
        c.setListingDate(null);
        caseRepo.save(c);
        return true;
    }

    private void saveOrderFile(Case c, LocalDate hearingDate, String orderFile) {
        if (orderFile == null) return;

        Long userId = c.getUser().getId();
        Hearing h = hearingRepo.findByLegalCase_IdAndUser_IdAndDate(c.getId(), userId, hearingDate)
                .orElseGet(() -> Hearing.builder().date(hearingDate).legalCase(c).user(c.getUser()).build());

        if (h.getOrderDocId() != null || orderFile.equals(h.getEcourtsOrderFile())) return;

        h.setEcourtsOrderFile(orderFile);
        hearingRepo.save(h);
    }

    private JsonNode fetchCaseData(String cnr) {

        JsonNode root;

        try {
            root = http.get()
                    .uri(CASE_PATH, cnr)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .retrieve()
                    .body(JsonNode.class);

        } catch (RestClientResponseException e) {
            log.error("Case-detail API answered HTTP {} for CNR {}: {}",
                    e.getStatusCode().value(), cnr, abbreviate(e.getResponseBodyAsString()));
            return null;

        } catch (RestClientException e) {
            log.error("Case-detail API call failed for CNR {}: {}", cnr, e.getMessage());
            return null;
        }

        if (root == null) return null;

        JsonNode data = root.path("data").path("courtCaseData");
        return data.isMissingNode() || data.isNull() ? null : data;
    }

    // Upper case, no spaces or dashes, null when invalid
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

    // Short version of an error body for the log
    private static String abbreviate(String body) {
        if (body == null) return "";
        String flat = body.replaceAll("\\s+", " ").trim();
        return flat.length() > 300 ? flat.substring(0, 300) + "…" : flat;
    }
}
