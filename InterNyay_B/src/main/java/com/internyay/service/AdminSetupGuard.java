package com.internyay.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

// Checks the setup key for POST /api/admin/setup. Fails closed when no key is configured
// and locks out a client after repeated wrong keys
@Component
public class AdminSetupGuard {

    private static final int MIN_KEY_LENGTH = 32;
    private static final int MAX_FAILURES = 5;
    private static final long LOCKOUT_MS = Duration.ofMinutes(15).toMillis();

    // Never hard-code this, it comes from INTERNYAY_ADMIN_SETUP_KEY
    @Value("${internyay.admin.setup-key:}")
    private String setupKey;

    private record Attempts(int failures, long since) {}
    private final ConcurrentHashMap<String, Attempts> attempts = new ConcurrentHashMap<>();

    public enum Result { OK, DISABLED, LOCKED, WRONG_KEY }

    public Result check(String client, String suppliedKey) {

        // No key (or a weak one) means the endpoint is switched off
        if (setupKey == null || setupKey.length() < MIN_KEY_LENGTH) return Result.DISABLED;

        long now = System.currentTimeMillis();
        Attempts a = attempts.get(client);
        if (a != null && now - a.since() > LOCKOUT_MS) {
            attempts.remove(client);
            a = null;
        }
        if (a != null && a.failures() >= MAX_FAILURES) return Result.LOCKED;

        // Constant-time comparison so response time doesn't leak the key
        boolean ok = suppliedKey != null && MessageDigest.isEqual(
                setupKey.getBytes(StandardCharsets.UTF_8),
                suppliedKey.getBytes(StandardCharsets.UTF_8));

        if (ok) {
            attempts.remove(client);
            return Result.OK;
        }
        attempts.merge(client, new Attempts(1, now),
                (old, ignored) -> new Attempts(old.failures() + 1, old.since()));
        return Result.WRONG_KEY;
    }
}
