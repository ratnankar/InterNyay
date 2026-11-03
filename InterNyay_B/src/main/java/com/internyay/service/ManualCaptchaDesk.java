package com.internyay.service;

import com.internyay.scraper.DistrictPortalClient;
import com.internyay.scraper.DistrictPortalClient.PortalSession;
import com.internyay.scraper.DistrictPortalClient.SubmitResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

// Holds a portal session whose CAPTCHA the automatic reader could not read, until the signed-in user types it.
// A button that would have given up ("try again later") instead answers with a Challenge; the page shows the CAPTCHA
// window and sends the typed text to answer(), which finishes the very same work and returns what the button would have
// returned. Used by the dashboard's cause list refresh, the next hearing Refresh and the Get order button.
@Slf4j
@Service
public class ManualCaptchaDesk {

    // Sends the typed CAPTCHA to the portal with whatever the original lookup was asking for
    @FunctionalInterface
    public interface Submit {
        SubmitResult submit(String captcha) throws IOException;
    }

    // Turns the portal's answer into the result of the original button. May throw (the message reaches the user)
    @FunctionalInterface
    public interface Finish {
        Object finish(SubmitResult result);
    }

    // What the page gets when a CAPTCHA has to be typed: needsCaptcha is always true, captchaImage is a data URL
    public record Challenge(boolean needsCaptcha, String challengeId, String captchaImage, String message) {}

    private static final class Held {
        private final Long userId;
        private final PortalSession session;
        private final Submit submit;
        private final Finish finish;
        private final Instant created = Instant.now();

        private Held(Long userId, PortalSession session, Submit submit, Finish finish) {
            this.userId = userId;
            this.session = session;
            this.submit = submit;
            this.finish = finish;
        }
    }

    private final DistrictPortalClient portal;
    private final Duration ttl;
    private final Map<String, Held> open = new LinkedHashMap<>();

    public ManualCaptchaDesk(DistrictPortalClient portal,
                             @Value("${captcha.manual.ttl-minutes:10}") int ttlMinutes) {
        this.portal = portal;
        this.ttl = Duration.ofMinutes(Math.max(2, ttlMinutes));
    }

    // Keeps the session and gives the page the CAPTCHA to show
    public Challenge open(Long userId, PortalSession session, Submit submit, Finish finish, String message) {
        byte[] image;

        try {
            image = portal.captcha(session);
        } catch (IOException | RuntimeException e) {
            log.warn("Manual CAPTCHA: the picture could not be loaded: {}", e.getMessage());
            throw new IllegalArgumentException("Could not get the CAPTCHA from eCourts right now, try again in a moment");
        }

        String id = UUID.randomUUID().toString();
        synchronized (open) {
            open.put(id, new Held(userId, session, submit, finish));
        }
        return new Challenge(true, id, dataUrl(image), message == null ? "" : message);
    }

    // The typed CAPTCHA: a wrong one answers with a new Challenge, the right one with the original button's result
    public Object answer(Long userId, String id, String captcha) {
        if (captcha == null || captcha.isBlank()) throw new IllegalArgumentException("Type the CAPTCHA shown");

        Held held = owned(userId, id);
        if (held == null) throw new IllegalArgumentException("This CAPTCHA has expired, press the button again");

        SubmitResult result;

        try {
            result = held.submit.submit(captcha.trim());
        } catch (IOException | RuntimeException e) {
            forget(id);
            log.warn("Manual CAPTCHA: submit failed: {}", e.getMessage());
            throw new IllegalArgumentException("Could not read the answer from eCourts right now, try again in a moment");
        }

        if (result.captchaRejected()) {
            return new Challenge(true, id, dataUrl(freshImage(id, held)), "The CAPTCHA was wrong, type the new one");
        }

        forget(id);
        return held.finish.finish(result);
    }

    // A new picture, when the CAPTCHA cannot be read
    public Challenge refresh(Long userId, String id) {
        Held held = owned(userId, id);
        if (held == null) throw new IllegalArgumentException("This CAPTCHA has expired, press the button again");
        return new Challenge(true, id, dataUrl(freshImage(id, held)), "");
    }

    // The user closed the window
    public void cancel(Long userId, String id) {
        if (owned(userId, id) != null) forget(id);
    }

    private byte[] freshImage(String id, Held held) {
        try {
            return portal.captcha(held.session);
        } catch (IOException | RuntimeException e) {
            forget(id);
            throw new IllegalArgumentException("Could not get a new CAPTCHA from eCourts, try again in a moment");
        }
    }

    private Held owned(Long userId, String id) {
        synchronized (open) {
            Held h = id == null ? null : open.get(id);
            if (h == null || !h.userId.equals(userId)) return null;
            if (h.created.isBefore(Instant.now().minus(ttl))) { open.remove(id); return null; }
            return h;
        }
    }

    private void forget(String id) {
        synchronized (open) {
            open.remove(id);
        }
    }

    // Windows nobody finished are dropped after the session time
    @Scheduled(fixedDelay = 300_000L, initialDelay = 300_000L)
    void purge() {
        Instant limit = Instant.now().minus(ttl);
        synchronized (open) {
            open.values().removeIf(h -> h.created.isBefore(limit));
        }
    }

    private static String dataUrl(byte[] image) {
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(image);
    }
}
