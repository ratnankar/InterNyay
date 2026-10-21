package com.internyay.service;

import com.internyay.dto.LoginLogDto;
import com.internyay.dto.LoginLogPageDto;
import com.internyay.entity.LoginLog;
import com.internyay.entity.LoginLog.App;
import com.internyay.entity.LoginLog.EventType;
import com.internyay.entity.LoginLog.Method;
import com.internyay.entity.User;
import com.internyay.repository.LoginLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

// Records sign-ins, failed sign-ins and sign-outs, and lists them for the admin page.
// Writing the log must never break a sign-in, so every write swallows its own errors.
@Service
@RequiredArgsConstructor
@Slf4j
public class LoginLogService {

    private final LoginLogRepository repo;

    // A successful sign-in
    public void success(User user, Method method) {
        save(EventType.LOGIN, method, user.getId(), user.getEmail(), user.getRole(), null);
    }

    // A refused sign-in, user may be null when the email has no account
    public void failure(Method method, User user, String email, String role, String reason) {
        save(EventType.LOGIN_FAILED, method, user == null ? null : user.getId(), email, role, reason);
    }

    // A sign-out the app told us about (closing the tab or an expired session never reaches the server)
    public void logout(User user) {
        save(EventType.LOGOUT, null, user.getId(), user.getEmail(), user.getRole(), null);
    }

    // One page of the log, newest first, optionally only one kind of event, an email search and/or one account (userId / exact email)
    public LoginLogPageDto search(String type, String app, String q, Long userId, String email, int page, int size) {

        EventType eventType = parseType(type);
        App appFilter = parseApp(app);
        String like = q == null || q.isBlank() ? null : "%" + q.trim().toLowerCase(Locale.ROOT) + "%";

        // One account only: its own id, or exactly its email (never a partial match like the search box)
        String exactEmail = email == null || email.isBlank() ? null : email.trim().toLowerCase(Locale.ROOT);

        Specification<LoginLog> spec = (root, query, cb) -> {
            List<Predicate> all = new ArrayList<>();
            if (userId != null || exactEmail != null) {
                List<Predicate> mine = new ArrayList<>();
                if (userId != null) mine.add(cb.equal(root.get("userId"), userId));
                if (exactEmail != null) mine.add(cb.equal(cb.lower(root.get("email")), exactEmail));
                all.add(cb.or(mine.toArray(new Predicate[0])));
            }
            if (eventType != null) all.add(cb.equal(root.get("eventType"), eventType));
            if (appFilter != null) all.add(cb.equal(root.get("app"), appFilter));
            if (like != null) {
                all.add(cb.or(
                        cb.like(cb.lower(root.get("email")), like),
                        cb.like(cb.lower(root.get("ipAddress")), like)));
            }
            return cb.and(all.toArray(new Predicate[0]));
        };

        int safeSize = Math.min(Math.max(size, 10), 100);
        Page<LoginLog> result = repo.findAll(spec,
                PageRequest.of(Math.max(page, 0), safeSize, Sort.by(Sort.Direction.DESC, "createdAt", "id")));

        LocalDateTime since = LocalDateTime.now().minusHours(24);

        return LoginLogPageDto.builder()
                .items(result.getContent().stream().map(LoginLogDto::from).toList())
                .page(result.getNumber())
                .totalPages(result.getTotalPages())
                .totalElements(result.getTotalElements())
                .logins24h(repo.countByEventTypeAndCreatedAtAfter(EventType.LOGIN, since))
                .failed24h(repo.countByEventTypeAndCreatedAtAfter(EventType.LOGIN_FAILED, since))
                .build();
    }

    // Anything but a known event name means "all"
    private static EventType parseType(String type) {
        if (type == null) return null;
        try {
            return EventType.valueOf(type.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    // Anything but a known app name means "all"
    private static App parseApp(String app) {
        if (app == null) return null;
        try {
            return App.valueOf(app.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    // The Calendar app names itself with the header X-Client-App: calendar; every other request is the website.
    // It is a label for the admin page only, never used to decide what someone may do.
    private static App appOf(HttpServletRequest req) {
        String app = req.getHeader("X-Client-App");
        return app != null && app.trim().equalsIgnoreCase("calendar") ? App.CALENDAR : App.WEB;
    }

    private void save(EventType type, Method method, Long userId, String email, String role, String reason) {
        try {
            LoginLog row = new LoginLog();
            row.setEventType(type);
            row.setMethod(method);
            row.setUserId(userId);
            row.setEmail(cut(email, 255));
            row.setRole(cut(role, 20));
            row.setFailureReason(cut(reason, 255));

            // Address and browser of the request being handled. With FORWARD_HEADERS_STRATEGY=native behind nginx
            // the remote address is the visitor's real address.
            if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
                HttpServletRequest req = attrs.getRequest();
                row.setApp(appOf(req));
                row.setIpAddress(cut(req.getRemoteAddr(), 64));
                row.setUserAgent(withClient(req.getHeader("User-Agent"), req.getHeader("X-Client-Platform"), req.getHeader("X-Client-Browser")));
            }

            repo.save(row);
        } catch (Exception ex) {
            log.warn("Could not write the login log: {}", ex.getMessage());
        }
    }

    // A phone using the "desktop site" sends a Linux browser string, so the system the browser itself reports
    // (X-Client-Platform, from the app) is added to the end as "; platform=Android" and shown by the login log page
    // The browser name the browser reports (Brave, Edge, Samsung Internet ...) is added the same way as "; browser=Brave"
    private static String withClient(String userAgent, String platform, String browser) {
        String p = cut(platform == null ? null : platform.replaceAll("[^A-Za-z0-9 ._-]", ""), 30);
        String b = cut(browser == null ? null : browser.replaceAll("[^A-Za-z0-9 ._-]", ""), 40);
        String ua = userAgent == null ? "" : userAgent.trim();
        String marker = (b == null || b.isEmpty() ? "" : " ; browser=" + b) + (p == null || p.isEmpty() ? "" : " ; platform=" + p);
        if (marker.isEmpty()) return cut(ua, 255);
        if (ua.length() > 255 - marker.length()) ua = ua.substring(0, 255 - marker.length());
        return ua + marker;
    }

    private static String cut(String s, int max) {
        if (s == null) return null;
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
