package com.internyay.service.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.internyay.exception.ChatUnavailableException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

// Speech to text for the chat assistant. Sends the recording to an OpenAI compatible /audio/transcriptions endpoint
// WITHOUT a language, so the speech model detects whether the person spoke Hindi, English, Tamil and so on
@Service
@Slf4j
public class TranscribeService {

    private final RestClient http;
    private final String baseUrl;
    private final String apiKey;
    private final String model;
    private final long maxBytes;

    public TranscribeService(
            RestClient.Builder builder,
            @Value("${internyay.chat.base-url:}") String chatBaseUrl,
            @Value("${internyay.chat.api-key:}") String chatApiKey,
            @Value("${internyay.chat.transcribe-base-url:}") String baseUrl,
            @Value("${internyay.chat.transcribe-api-key:}") String apiKey,
            @Value("${internyay.chat.transcribe-model:}") String model,
            @Value("${internyay.chat.transcribe-max-bytes:10485760}") long maxBytes) {

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(60_000);

        // Own URL and key when given, else the ones the chat model uses
        String url = (baseUrl == null || baseUrl.isBlank()) ? chatBaseUrl : baseUrl;
        String key = (apiKey == null || apiKey.isBlank()) ? chatApiKey : apiKey;

        this.http = builder.requestFactory(factory).build();
        this.baseUrl = url == null ? "" : url.trim().replaceAll("/+$", "");
        this.apiKey = key == null ? "" : key.trim();
        this.model = model == null ? "" : model.trim();
        this.maxBytes = maxBytes;
    }

    // Needs a base URL and a transcription model
    public boolean isEnabled() {
        return !baseUrl.isEmpty() && !model.isEmpty();
    }

    public long maxBytes() {
        return maxBytes;
    }

    // Returns the spoken text (empty when nothing could be heard)
    public String transcribe(byte[] audio, String filename, String contentType) {
        if (!isEnabled()) {
            throw new ChatUnavailableException("Voice input is not set up on this server.");
        }

        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("model", model);
        form.add("response_format", "json");
        // No "language" field on purpose: that is what turns on automatic language detection
        form.add("file", new ByteArrayResource(audio) {
            @Override
            public String getFilename() {
                return filename;
            }
        });

        try {
            RestClient.RequestBodySpec request = http.post()
                    .uri(baseUrl + "/audio/transcriptions")
                    .contentType(MediaType.MULTIPART_FORM_DATA);
            if (!apiKey.isEmpty()) request = request.header("Authorization", "Bearer " + apiKey);

            JsonNode response = request.body(form).retrieve().body(JsonNode.class);
            return response == null ? "" : response.path("text").asText("").trim();

        } catch (RestClientResponseException e) {
            log.error("Transcription error {}: {}", e.getStatusCode().value(), e.getResponseBodyAsString());
            throw new ChatUnavailableException(e.getStatusCode().value() == 429
                    ? "Voice input is busy right now. Please try again in a moment."
                    : "Voice input could not understand the recording. Please try again.");
        } catch (RestClientException e) {
            log.error("Transcription service unreachable", e);
            throw new ChatUnavailableException("Voice input could not be reached. Please try again.");
        }
    }
}
