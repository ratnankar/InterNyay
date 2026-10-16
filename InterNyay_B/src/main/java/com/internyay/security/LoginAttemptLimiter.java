package com.internyay.security;

import com.internyay.exception.TooManyAttemptsException;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

// Blocks password guessing: after maxFailures wrong passwords for one email the login is refused for lockMinutes.
// Kept in memory (per server instance), a restart clears it. With several backend instances behind a load balancer
// each one counts on its own, so use a gateway or shared store if you need one global limit.
public class LoginAttemptLimiter {

    private record Entry(int failures, long windowStart, long lockedUntil) { }

    private final ConcurrentHashMap<String, Entry> entries = new ConcurrentHashMap<>();
    private final int maxFailures;
    private final long windowMs;
    private final long lockMs;

    public LoginAttemptLimiter(int maxFailures, Duration window, Duration lock) {
        this.maxFailures = maxFailures;
        this.windowMs = window.toMillis();
        this.lockMs = lock.toMillis();
    }

    // Throws when the email is currently locked
    public void check(String key) {
        Entry e = entries.get(key);
        if (e != null && e.lockedUntil() > System.currentTimeMillis()) {
            long minutes = Math.max(1, (e.lockedUntil() - System.currentTimeMillis() + 59_999) / 60_000);
            throw new TooManyAttemptsException(
                    "Too many failed sign-in attempts. Try again in " + minutes + " minute(s) or reset your password.");
        }
    }

    // Counts one wrong password
    public void fail(String key) {
        long now = System.currentTimeMillis();
        entries.compute(key, (k, old) -> {
            if (old == null || now - old.windowStart() > windowMs) {
                return new Entry(1, now, 0);
            }
            int failures = old.failures() + 1;
            return failures >= maxFailures
                    ? new Entry(0, now, now + lockMs)
                    : new Entry(failures, old.windowStart(), 0);
        });
        if (entries.size() > 50_000) cleanup(now);
    }

    // A good login clears the count
    public void reset(String key) {
        entries.remove(key);
    }

    // Drops expired entries so the map cannot grow without limit
    private void cleanup(long now) {
        entries.entrySet().removeIf(en -> en.getValue().lockedUntil() < now
                && now - en.getValue().windowStart() > windowMs);
    }
}
