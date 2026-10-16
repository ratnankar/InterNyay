package com.internyay.service;

import com.internyay.dto.HearingDto;
import com.internyay.entity.Case;
import com.internyay.entity.Hearing;
import com.internyay.repository.HearingRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.internyay.util.OrderCutoff;

import java.util.Locale;
import java.util.regex.Pattern;

// Gets the order of a hearing from eCourts the first time it is asked for and keeps it in our own storage.
// The file to ask for (order-N.pdf as eCourts numbers it) was saved on the hearing when the case-detail API
// listed an order for that date. After the first fetch the stored copy is used
@Service
@Slf4j
public class EcourtsOrderService {

    private static final String ORDER_PATH = "/api/partner/case/{cnr}/order/{filename}";
    private static final Pattern CNR_FORMAT = Pattern.compile("[A-Z0-9]{16}");
    private static final long MAX_PDF_BYTES = 25L * 1024 * 1024;

    public enum Status {
        // Already in our storage, eCourts was not called
        STORED,
        // Downloaded from eCourts just now and stored
        FETCHED,
        // The court or case type does not declare orders, eCourts was not called
        NOT_DECLARED,
        // Could not be fetched (no token, no CNR, not due yet, no order listed, API error)
        UNAVAILABLE
    }

    public record Result(Status status, String message, HearingDto hearing) {}

    private final HearingRepository hearingRepo;
    private final HearingService hearingService;
    private final OrdersPolicyService policy;
    private final RestClient http;
    private final String token;
    private final boolean signed;
    private final String downloadPath;

    public EcourtsOrderService(
            HearingRepository hearingRepo,
            HearingService hearingService,
            OrdersPolicyService policy,
            RestClient.Builder builder,
            @Value("${ecourts.api.base-url:https://webapi.ecourtsindia.com}") String baseUrl,
            @Value("${ecourts.api.token:}") String token,
            @Value("${ecourts.api.order-signed:true}") boolean signed,
            @Value("${ecourts.api.order-download-path:}") String downloadPath) {

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(60_000);

        this.hearingRepo = hearingRepo;
        this.hearingService = hearingService;
        this.policy = policy;
        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.token = token == null ? "" : token.trim();
        this.signed = signed;
        this.downloadPath = downloadPath == null ? "" : downloadPath.trim();
    }

    // Order of one hearing: from our storage when we have it, otherwise from eCourts (and then stored)
    public Result orderFor(Long hearingId, Long userId) {

        Hearing h = hearingRepo.findWithCaseById(hearingId)
                .orElseThrow(() -> new RuntimeException("Hearing not found"));
        if (!h.getUser().getId().equals(userId)) throw new RuntimeException("Forbidden");

        Case c = h.getLegalCase();

        // Already stored (fetched before, or uploaded by hand): no request to eCourts
        if (h.getOrderDocId() != null) {
            return new Result(Status.STORED, null, hearingService.toDto(h.getId(), userId));
        }

        OrdersPolicyService.Verdict verdict = policy.forCase(c);
        if (!verdict.declared()) {
            return new Result(Status.NOT_DECLARED, verdict.reason(), null);
        }

        String cnr = normalizeCnr(c.getCnrNo());
        if (cnr == null) {
            return new Result(Status.UNAVAILABLE, "Add the 16-character CNR number to this case to fetch its orders", null);
        }
        if (token.isEmpty()) {
            log.warn("Order fetch skipped: ecourts.api.token is not set (set ECOURTS_API_TOKEN)");
            return new Result(Status.UNAVAILABLE, "Fetching orders from eCourts is not set up on this server", null);
        }

        if (!OrderCutoff.passed(h.getDate())) {
            return new Result(Status.UNAVAILABLE, "The order can be fetched after 6 PM on the hearing date", null);
        }

        String filename = h.getEcourtsOrderFile();
        if (filename == null || filename.isBlank()) {
            return new Result(Status.UNAVAILABLE, "eCourts has no order listed for " + h.getDate(), null);
        }

        byte[] pdf = download(cnr, filename);
        if (pdf == null) {
            return new Result(Status.UNAVAILABLE,
                    "The order for " + h.getDate() + " could not be downloaded from eCourts. Try again later or attach the PDF yourself", null);
        }

        HearingDto stored = hearingService.attachFetchedOrder(h.getId(), pdf, filename, userId);
        return new Result(Status.FETCHED, null, stored);
    }

    // Asks eCourts for the order. Returns the PDF bytes, or null when it could not be had
    private byte[] download(String cnr, String filename) {

        ResponseEntity<byte[]> response;
        try {
            response = http.get()
                    .uri(ORDER_PATH + "?signed={signed}", cnr, filename, signed)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .accept(MediaType.APPLICATION_PDF, MediaType.APPLICATION_JSON)
                    .retrieve()
                    .toEntity(byte[].class);

        } catch (RestClientResponseException e) {
            log.error("Order API answered HTTP {} for CNR {} {}: {}",
                    e.getStatusCode().value(), cnr, filename, abbreviate(e.getResponseBodyAsString()));
            return null;

        } catch (RestClientException e) {
            log.error("Order API call failed for CNR {} {}: {}", cnr, filename, e.getMessage());
            return null;
        }

        byte[] body = response.getBody();
        if (body == null || body.length == 0) return null;

        // The order endpoint may hand back the PDF itself
        if (isPdf(body)) return limit(body, cnr, filename);

        // Or details about the order, with the file coming from the document download endpoint
        return downloadFromDocumentEndpoint(cnr, filename, body);
    }

    // The order endpoint answered with details only. The document download path comes from configuration
    // (ecourts.api.order-download-path, with {cnr} and {filename} in it), because the order endpoint does not name it
    private byte[] downloadFromDocumentEndpoint(String cnr, String filename, byte[] metadata) {

        if (downloadPath.isEmpty()) {
            log.error("Order API returned details but no PDF for CNR {} {}. Set ecourts.api.order-download-path "
                    + "(ECOURTS_ORDER_DOWNLOAD_PATH) to the document download endpoint. Answer: {}",
                    cnr, filename, abbreviate(new String(metadata, java.nio.charset.StandardCharsets.UTF_8)));
            return null;
        }

        try {
            byte[] pdf = http.get()
                    .uri(downloadPath.replace("{cnr}", cnr).replace("{filename}", filename))
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .accept(MediaType.APPLICATION_PDF, MediaType.APPLICATION_OCTET_STREAM)
                    .retrieve()
                    .body(byte[].class);

            if (pdf != null && isPdf(pdf)) return limit(pdf, cnr, filename);

            log.error("Document download for CNR {} {} did not return a PDF", cnr, filename);
            return null;

        } catch (RestClientResponseException e) {
            log.error("Document download answered HTTP {} for CNR {} {}: {}",
                    e.getStatusCode().value(), cnr, filename, abbreviate(e.getResponseBodyAsString()));
            return null;

        } catch (RestClientException e) {
            log.error("Document download failed for CNR {} {}: {}", cnr, filename, e.getMessage());
            return null;
        }
    }

    // Every PDF starts with %PDF
    private static boolean isPdf(byte[] b) {
        return b.length > 4 && b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F';
    }

    private static byte[] limit(byte[] pdf, String cnr, String filename) {
        if (pdf.length <= MAX_PDF_BYTES) return pdf;
        log.error("Order {} of CNR {} is larger than {} MB, not stored", filename, cnr, MAX_PDF_BYTES / 1024 / 1024);
        return null;
    }

    // Upper case, no spaces or dashes, null when invalid
    private static String normalizeCnr(String raw) {
        if (raw == null) return null;
        String cnr = raw.trim().toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
        return CNR_FORMAT.matcher(cnr).matches() ? cnr : null;
    }

    // Short version of an error body for the log
    private static String abbreviate(String body) {
        if (body == null) return "";
        String flat = body.replaceAll("\\s+", " ").trim();
        return flat.length() > 300 ? flat.substring(0, 300) + "…" : flat;
    }
}
