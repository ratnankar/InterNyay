package com.internyay.config;

import org.springframework.stereotype.Component;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

// Remembers which actions (saves, uploads, refreshes, imports ...) of each account are running on the server right now.
// The browser asks for this list after a page refresh, a switch to another case or a second tab, so a button whose
// action is still running stays unavailable until the server really has finished it (not just until the page forgot it).
// An action is named like "POST /cases/12/cause-list/refresh?date=2026-11-05" (method, address without /api, query sorted).
@Component
public class InFlightRegistry {

    // account id -> action name -> how many identical calls are running
    private final Map<String, Map<String, AtomicInteger>> running = new ConcurrentHashMap<>();

    public void start(String account, String action) {
        running.computeIfAbsent(account, k -> new ConcurrentHashMap<>())
                .computeIfAbsent(action, k -> new AtomicInteger())
                .incrementAndGet();
    }

    public void finish(String account, String action) {
        Map<String, AtomicInteger> mine = running.get(account);
        if (mine == null) return;
        mine.computeIfPresent(action, (k, n) -> n.decrementAndGet() <= 0 ? null : n);
        if (mine.isEmpty()) running.remove(account, mine);
    }

    // Names of the actions this account has running right now
    public List<String> of(String account) {
        Map<String, AtomicInteger> mine = running.get(account);
        return mine == null ? List.of() : new ArrayList<>(mine.keySet());
    }

    // "POST", "/api/cases/12/x", "date=2026-11-05&a=" -> "POST /cases/12/x?date=2026-11-05".
    // Must give exactly what the frontend's busyStore.actionKey gives for the same call
    public static String actionName(String method, String uri, String query) {
        String path = uri.startsWith("/api/") || uri.equals("/api") ? uri.substring(4) : uri;
        if (path.length() > 1 && path.endsWith("/")) path = path.substring(0, path.length() - 1);
        List<String> pairs = new ArrayList<>();
        if (query != null && !query.isBlank()) {
            for (String part : query.split("&")) {
                if (part.isEmpty()) continue;
                int eq = part.indexOf('=');
                String k = decode(eq < 0 ? part : part.substring(0, eq));
                String v = eq < 0 ? "" : decode(part.substring(eq + 1));
                // The frontend skips empty values too
                if (!v.isEmpty()) pairs.add(k + "=" + v);
            }
            java.util.Collections.sort(pairs);
        }
        return method.toUpperCase() + " " + path + (pairs.isEmpty() ? "" : "?" + String.join("&", pairs));
    }

    private static String decode(String s) {
        try {
            return URLDecoder.decode(s, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return s;
        }
    }
}
