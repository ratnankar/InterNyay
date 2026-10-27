package com.internyay.scraper;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;
import java.util.regex.Pattern;

@Slf4j
@Component
public class CaptchaSolverClient {

    private static final Pattern VALID_TEXT = Pattern.compile("[A-Za-z0-9]{1,12}");
    private static final long PAUSE_MS = 60_000L;

    private final ObjectMapper mapper = new ObjectMapper();
    private final boolean enabled;
    private final URI endpoint;
    private final String key;
    private final Duration timeout;
    private final int maxAttempts;
    private final HttpClient http;
    private volatile long pausedUntil;

    public CaptchaSolverClient(
            @Value("${captcha.solver.enabled:true}") boolean enabled,
            @Value("${captcha.solver.url:http://127.0.0.1:8001}") String url,
            @Value("${captcha.solver.key:}") String key,
            @Value("${captcha.solver.timeout-ms:4000}") long timeoutMs,
            @Value("${captcha.solver.max-attempts:4}") int maxAttempts) {
        this.enabled = enabled;
        this.endpoint = URI.create(url.replaceAll("/+$", "") + "/solve");
        this.key = key == null ? "" : key.trim();
        this.timeout = Duration.ofMillis(Math.max(500, timeoutMs));
        this.maxAttempts = Math.max(1, maxAttempts);
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofMillis(Math.min(2000, this.timeout.toMillis())))
                .build();
    }

    public boolean available() {
        return enabled && System.currentTimeMillis() >= pausedUntil;
    }

    public int maxAttempts() {
        return maxAttempts;
    }

    public Optional<String> solve(byte[] image) {
        if (!available() || image == null || image.length == 0) return Optional.empty();

        HttpRequest.Builder request = HttpRequest.newBuilder(endpoint)
                .timeout(timeout)
                .header("Content-Type", "application/octet-stream")
                .POST(HttpRequest.BodyPublishers.ofByteArray(image));
        if (!key.isEmpty()) request.header("X-Solver-Key", key);

        try {
            HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            if (status == 200) return textOf(response.body());
            if (status == 401 || status >= 500) {
                log.error("CAPTCHA service answered HTTP {}, pausing it for {} seconds", status, PAUSE_MS / 1000);
                pause();
            } else {
                log.warn("CAPTCHA service refused the image with HTTP {}", status);
            }
            return Optional.empty();
        } catch (IOException e) {
            log.warn("CAPTCHA service not reachable ({}), pausing it for {} seconds", e.getMessage(), PAUSE_MS / 1000);
            pause();
            return Optional.empty();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        }
    }

    private Optional<String> textOf(String body) throws IOException {
        JsonNode text = mapper.readTree(body).path("text");
        if (!text.isTextual()) return Optional.empty();
        String value = text.asText().trim();
        return VALID_TEXT.matcher(value).matches() ? Optional.of(value) : Optional.empty();
    }

    private void pause() {
        pausedUntil = System.currentTimeMillis() + PAUSE_MS;
    }
}
