package com.internyay.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.internyay.entity.WhatsAppMessageLog.Kind;
import com.internyay.entity.WhatsAppMessageLog.Status;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

// Talks to the Meta WhatsApp Cloud API
@Service
@Slf4j
public class WhatsAppSender {

    // Result of one send: status and error
    public record Outcome(Status status, String error) {
        public boolean ok() { return status == Status.SENT || status == Status.DRY_RUN; }

        static Outcome failed(String error) { return new Outcome(Status.FAILED, error); }
    }

    private final RestClient http;
    private final String phoneNumberId;
    private final String token;
    private final String language;
    private final String defaultCountryCode;
    private final boolean dryRun;
    private final String hearingTemplate;
    private final String paymentTemplate;

    public WhatsAppSender(
            RestClient.Builder builder,
            @Value("${whatsapp.api.base-url:https://graph.facebook.com/v25.0}") String baseUrl,
            @Value("${whatsapp.api.phone-number-id:}") String phoneNumberId,
            @Value("${whatsapp.api.token:}") String token,
            @Value("${whatsapp.template.language:en}") String language,
            @Value("${whatsapp.template.hearing-reminder:internyay_hearing_reminder}") String hearingTemplate,
            @Value("${whatsapp.template.payment-due:internyay_payment_due}") String paymentTemplate,
            @Value("${whatsapp.default-country-code:91}") String defaultCountryCode,
            @Value("${whatsapp.dry-run:false}") boolean dryRun) {

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(20_000);

        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.phoneNumberId = phoneNumberId == null ? "" : phoneNumberId.trim();
        this.token = token == null ? "" : token.trim();
        this.language = language;
        this.hearingTemplate = hearingTemplate;
        this.paymentTemplate = paymentTemplate;
        this.defaultCountryCode = defaultCountryCode;
        this.dryRun = dryRun;
    }

    // Needs both the token and the phone number id
    public boolean isConfigured() {
        return !token.isEmpty() && !phoneNumberId.isEmpty();
    }

    // Dry run only logs messages
    public boolean isDryRun() {
        return dryRun;
    }

    // Sends a template message to one number
    public Outcome send(Kind kind, String rawPhone, List<String> params) {

        String to = normalizePhone(rawPhone);
        if (to == null) {
            return Outcome.failed("\"" + rawPhone + "\" is not a valid WhatsApp number");
        }

        String template = kind == Kind.PAYMENT_DUE ? paymentTemplate : hearingTemplate;
        List<String> values = params.stream().map(WhatsAppSender::clean).toList();

        if (dryRun) {
            log.info("WhatsApp DRY RUN → +{} template={} params={}", to, template, values);
            return new Outcome(Status.DRY_RUN, null);
        }

        if (!isConfigured()) {
            return Outcome.failed("WhatsApp is not set up on the server yet "
                    + "(whatsapp.api.token and whatsapp.api.phone-number-id are missing)");
        }

        List<Map<String, String>> parameters = new ArrayList<>();
        for (String v : values) parameters.add(Map.of("type", "text", "text", v));

        Map<String, Object> body = Map.of(
                "messaging_product", "whatsapp",
                "recipient_type", "individual",
                "to", to,
                "type", "template",
                "template", Map.of(
                        "name", template,
                        "language", Map.of("code", language),
                        "components", List.of(Map.of("type", "body", "parameters", parameters))));

        try {
            http.post()
                    .uri("/{id}/messages", phoneNumberId)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();

            return new Outcome(Status.SENT, null);

        } catch (RestClientResponseException ex) {
            String detail = extractError(ex);
            log.warn("WhatsApp send to +{} failed: HTTP {} — {}", to, ex.getStatusCode().value(), detail);
            return Outcome.failed(detail);

        } catch (RestClientException ex) {
            log.warn("WhatsApp send to +{} failed: {}", to, ex.getMessage());
            return Outcome.failed("Could not reach WhatsApp (" + ex.getMessage() + ")");
        }
    }

    // Digits only with the country code, 10 digit Indian numbers get 91 in front
    public String normalizePhone(String raw) {
        if (raw == null) return null;

        String digits = raw.replaceAll("\\D", "");
        if (digits.startsWith("00")) digits = digits.substring(2);

        if (digits.length() == 10) return defaultCountryCode + digits;
        if (digits.length() == 11 && digits.startsWith("0")) return defaultCountryCode + digits.substring(1);
        if (digits.length() >= 11 && digits.length() <= 15) return digits;

        return null;
    }

    // Template parameters can't be empty or too long
    private static String clean(String v) {
        String s = v == null ? "" : v.replaceAll("\\s+", " ").trim();
        if (s.isEmpty()) return "-";
        return s.length() > 500 ? s.substring(0, 497) + "..." : s;
    }

    // Pulls the readable message out of the API's error body
    private static String extractError(RestClientResponseException ex) {
        try {
            String msg = ex.getResponseBodyAs(JsonNode.class).path("error").path("message").asText("");
            if (!msg.isBlank()) return msg.length() > 400 ? msg.substring(0, 400) : msg;
        } catch (Exception ignored) {
            // body is not the expected JSON: use the generic message below
        }
        return "WhatsApp rejected the message (HTTP " + ex.getStatusCode().value() + ")";
    }
}
