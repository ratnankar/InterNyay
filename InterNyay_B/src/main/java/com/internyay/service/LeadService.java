package com.internyay.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

// Rate limit for the public landing page contact form
@Service
public class LeadService {

    private static final long WINDOW_MS = 60L * 60 * 1000;

    @Value("${internyay.leads.max-per-hour:10}")
    private int maxPerHour;

    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    // Sliding window per IP address
    public void checkRate(String ip) {
        long now = Instant.now().toEpochMilli();
        Deque<Long> q = hits.computeIfAbsent(ip == null ? "unknown" : ip, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && now - q.peekFirst() > WINDOW_MS) q.pollFirst();
            if (q.size() >= maxPerHour) {
                throw new IllegalArgumentException("Too many attempts. Please try again later.");
            }
            q.addLast(now);
        }
        if (hits.size() > 5000) {
            hits.entrySet().removeIf(e -> e.getValue().isEmpty());
        }
    }
}
