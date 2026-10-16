package com.internyay.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;

// Limits how often one client IP can call login, Google sign-in and the OTP endpoints.
// Answers HTTP 429 with a Retry-After header and the usual {"message": ...} body when the limit is used up.
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    // Which rule an endpoint belongs to
    private enum Policy { LOGIN, GOOGLE, OTP_SEND, OTP_VERIFY }

    // POST endpoints that are limited
    private static final Map<String, Policy> POLICIES = Map.ofEntries(
            Map.entry("/api/auth/login", Policy.LOGIN),
            Map.entry("/api/auth/google/login", Policy.GOOGLE),
            Map.entry("/api/auth/google/register", Policy.GOOGLE),
            Map.entry("/api/auth/register/send-otp", Policy.OTP_SEND),
            Map.entry("/api/auth/forgot-password/send-otp", Policy.OTP_SEND),
            Map.entry("/api/auth/me/email/send-otp", Policy.OTP_SEND),
            Map.entry("/api/auth/register/verify-otp", Policy.OTP_VERIFY),
            Map.entry("/api/auth/forgot-password/reset", Policy.OTP_VERIFY),
            Map.entry("/api/auth/me/email/confirm", Policy.OTP_VERIFY));

    // Upper bound of tracked clients per rule, so the memory use stays small even under a flood
    private static final long MAX_CLIENTS = 100_000;

    private final RateLimitProperties props;
    private final ObjectMapper objectMapper;

    // One cache of client buckets per rule; an idle bucket is dropped after its window because it would be full again anyway
    private final Map<Policy, Cache<String, Bucket>> buckets = new java.util.EnumMap<>(Policy.class);

    public RateLimitFilter(RateLimitProperties props, ObjectMapper objectMapper) {
        this.props = props;
        this.objectMapper = objectMapper;
        for (Policy p : Policy.values()) {
            buckets.put(p, Caffeine.newBuilder()
                    .maximumSize(MAX_CLIENTS)
                    .expireAfterAccess(Duration.ofMinutes(Math.max(1, ruleOf(p).getWindowMinutes())))
                    .build());
        }
    }

    // Runs once per request
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        Policy policy = props.isEnabled() && "POST".equalsIgnoreCase(request.getMethod())
                ? POLICIES.get(request.getRequestURI())
                : null;

        if (policy != null) {
            RateLimitProperties.Rule rule = ruleOf(policy);
            Bucket bucket = buckets.get(policy).get(clientKey(request), k -> newBucket(rule));
            ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
            if (!probe.isConsumed()) {
                long seconds = Math.max(1, (probe.getNanosToWaitForRefill() + 999_999_999L) / 1_000_000_000L);
                response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                response.setHeader("Retry-After", String.valueOf(seconds));
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                objectMapper.writeValue(response.getWriter(), Map.of(
                        "message", "Too many requests. Please try again in " + humanWait(seconds) + "."));
                return;
            }
        }

        chain.doFilter(request, response);
    }

    // The rule settings for a policy
    private RateLimitProperties.Rule ruleOf(Policy policy) {
        return switch (policy) {
            case LOGIN -> props.getLogin();
            case GOOGLE -> props.getGoogle();
            case OTP_SEND -> props.getOtpSend();
            case OTP_VERIFY -> props.getOtpVerify();
        };
    }

    private static Bucket newBucket(RateLimitProperties.Rule rule) {
        int capacity = Math.max(1, rule.getCapacity());
        Duration window = Duration.ofMinutes(Math.max(1, rule.getWindowMinutes()));
        return Bucket.builder()
                .addLimit(limit -> limit.capacity(capacity).refillGreedy(capacity, window))
                .build();
    }

    // The client IP. Behind a proxy set server.forward-headers-strategy=native so Tomcat puts the real IP here;
    // X-Forwarded-For is deliberately not read directly because a client can fake it
    private static String clientKey(HttpServletRequest request) {
        return request.getRemoteAddr();
    }

    private static String humanWait(long seconds) {
        if (seconds < 60) return seconds + " seconds";
        long minutes = (seconds + 59) / 60;
        return minutes + (minutes == 1 ? " minute" : " minutes");
    }
}
