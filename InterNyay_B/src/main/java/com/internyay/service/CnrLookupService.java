package com.internyay.service;

import com.internyay.repository.CaseRepository;
import com.internyay.scraper.CaptchaSolverClient;
import com.internyay.scraper.DistrictPortalClient;
import com.internyay.scraper.DistrictPortalClient.PortalSession;
import com.internyay.scraper.DistrictPortalClient.SubmitResult;
import com.internyay.scraper.PortalCaseParser;
import com.internyay.scraper.PortalCaseParser.ParsedCase;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

// Reads a case from the eCourts Services portal (case status by CNR). start reads the portal's CAPTCHA with the CAPTCHA
// service and answers DONE with the case details when that works; when the service is off, down or cannot read the image
// it answers CAPTCHA and the advocate types it: answer (case details, or a new CAPTCHA when the answer was wrong).
//
// No order PDFs are downloaded here: when the case is saved, CaseService claims the lookup (the token the form carries)
// and only the hearing and order history is kept. A lookup nobody saves is dropped after the session time is over
@Slf4j
@Service
public class CnrLookupService {

    public static final String CAPTCHA = "CAPTCHA";
    public static final String DONE = "DONE";
    public static final String EXPIRED = "EXPIRED";

    // status: CAPTCHA (type the image), DONE (detail is filled) or EXPIRED (start again)
    public record Step(String status, String sessionId, String captchaImage, String message,
                       EcourtsCaseService.CaseDetail detail) {}

    // A lookup that was saved with a case: the history of the case and the orders still on their way
    public record Claim(EcourtsCaseService.Snapshot snapshot, Pending lookup) {}

    public static final class Pending {
        private final Long userId;
        private final String cnr;
        private final PortalSession session;
        private final Instant created = Instant.now();
        private volatile ParsedCase parsed;
        private volatile boolean cancelled;

        private Pending(Long userId, String cnr, PortalSession session) {
            this.userId = userId;
            this.cnr = cnr;
            this.session = session;
        }
    }

    // How many lookups one advocate can keep open at once (the oldest is dropped)
    private static final int MAX_OPEN_PER_USER = 3;

    private final DistrictPortalClient portal;
    private final CaptchaSolverClient solver;
    private final CaseRepository caseRepo;
    private final List<String> pages;
    private final String searchPath;
    private final Duration ttl;
    private final String stateCode;

    private final Map<String, Pending> open = new LinkedHashMap<>();

    public CnrLookupService(
            DistrictPortalClient portal,
            CaptchaSolverClient solver,
            CaseRepository caseRepo,
            @Value("${cnr.portal.page:casestatus/index,cnr_status/index}") String pages,
            @Value("${cnr.portal.path.search:cnr_status/searchByCNR/}") String searchPath,
            @Value("${cnr.portal.session-ttl-minutes:30}") int ttlMinutes,
            @Value("${causelist.district.state-code:26}") String stateCode) {
        this.portal = portal;
        this.solver = solver;
        this.caseRepo = caseRepo;
        this.pages = java.util.Arrays.stream(pages.split(",")).map(String::trim).filter(v -> !v.isEmpty()).toList();
        this.searchPath = searchPath;
        this.ttl = Duration.ofMinutes(Math.max(2, ttlMinutes));
        this.stateCode = stateCode;
    }

    // ---- the advocate's calls -----------------------------------------------------------------------------------

    // Opens a portal session for the CNR. DONE when the CAPTCHA was read automatically, CAPTCHA (its image) otherwise
    public Step start(Long userId, String rawCnr) {

        String cnr = EcourtsCaseService.normalizeCnr(rawCnr);
        if (cnr == null) throw new IllegalArgumentException("Enter the 16-character CNR number");
        if (caseRepo.existsByUser_IdAndCnrNoIgnoreCase(userId, cnr))
            throw new IllegalArgumentException("You already have a case with this CNR number (" + cnr + ")");

        Pending held;
        byte[] image;
        try {
            // The first ajax request settles the portal session; the CAPTCHA is fetched after it, so it belongs to the
            // session the answer is sent on (otherwise the first CAPTCHA of every lookup was refused).
            // A session whose warm-up gives no districts is one the portal later refuses every CAPTCHA on, so a new
            // session is opened instead (up to 5 tries)
            PortalSession session = null;
            for (int attempt = 1; attempt <= 5 && session == null; attempt++) {
                PortalSession candidate = openSession();
                if (portal.warmUp(candidate, stateCode)) {
                    session = candidate;
                } else {
                    log.info("Portal session {} of 5 for CNR {} is not usable (warm-up gave no districts){}", attempt, cnr,
                            attempt < 5 ? ", opening another" : ", giving up");
                }
            }
            if (session == null) throw new IOException("the portal only gave unusable sessions");
            held = new Pending(userId, cnr, session);
            image = portal.captcha(session);
        } catch (IOException | RuntimeException e) {
            log.warn("eCourts portal session for CNR {} could not be opened ({}): {}", cnr, e.getClass().getSimpleName(), e.getMessage(), e);
            throw new IllegalArgumentException("Could not reach eCourts right now (" + reasonOf(e) + "), try again in a moment");
        }

        String id = UUID.randomUUID().toString();
        synchronized (open) {
            dropOldest(userId);
            open.put(id, held);
        }
        return solveAutomatically(id, held, image);
    }

    // Sends the typed CAPTCHA. A wrong one gives a new image; the right one gives the case
    public Step answer(Long userId, String sessionId, String captcha) {

        Pending held = owned(userId, sessionId);
        if (held == null) return expired();
        if (captcha == null || captcha.isBlank()) throw new IllegalArgumentException("Type the CAPTCHA shown");

        SubmitResult result = search(held, captcha);
        if (result.html() == null && result.captchaRejected()) {
            return nextCaptcha(sessionId, held, "The CAPTCHA was wrong, type the new one");
        }
        return conclude(sessionId, held, result);
    }

    // The portal answers its home page (no app token) for a page address it does not know, so the addresses are tried in
    // turn (cnr.portal.page, comma separated) and the first one that gives a session is used
    private PortalSession openSession() throws IOException {
        IOException last = null;
        for (String candidate : pages) {
            try {
                return portal.open(candidate);
            } catch (IOException e) {
                last = e;
                log.info("Portal page {} gave no session: {}", candidate, e.getMessage());
            }
        }
        throw last != null ? last : new IOException("no portal page is configured (cnr.portal.page)");
    }

    // A new CAPTCHA image for the same session
    public Step refresh(Long userId, String sessionId) {
        Pending held = owned(userId, sessionId);
        if (held == null) return expired();
        return nextCaptcha(sessionId, held, "");
    }

    // ---- saving the case ----------------------------------------------------------------------------------------

    // The lookup behind a form that is being saved: its history (orders are not downloaded, only the Get order button does that). Null when the token is
    // not (or no longer) valid for this CNR; the case is then saved with what the form holds
    public Claim claim(Long userId, String token, String cnr) {
        if (token == null || token.isBlank()) return null;

        Pending held;
        synchronized (open) {
            held = open.get(token);
            if (held == null || !held.userId.equals(userId) || held.parsed == null || !held.cnr.equalsIgnoreCase(cnr)) return null;
            open.remove(token);
        }
        return new Claim(EcourtsCaseService.snapshotOf(held.parsed), held);
    }

    // ---- background work ----------------------------------------------------------------------------------------

    // Lookups nobody saved are dropped after the session time
    @Scheduled(fixedDelay = 300_000L, initialDelay = 300_000L)
    void purge() {
        Instant limit = Instant.now().minus(ttl);
        synchronized (open) {
            open.values().removeIf(p -> {
                boolean old = p.created.isBefore(limit);
                if (old) p.cancelled = true;
                return old;
            });
        }
    }

    // ---- helpers ------------------------------------------------------------------------------------------------

    private Step solveAutomatically(String id, Pending held, byte[] image) {
        if (!solver.available()) return captchaStep(id, image);

        byte[] current = image;
        for (int attempt = 1; attempt <= solver.maxAttempts(); attempt++) {
            Optional<String> text = solver.solve(current);
            if (text.isPresent()) {
                SubmitResult result = search(held, text.get());
                if (result.html() != null || !result.captchaRejected()) {
                    log.info("CNR {}: CAPTCHA read automatically on attempt {}", held.cnr, attempt);
                    return conclude(id, held, result);
                }
            } else if (!solver.available()) {
                break;
            }
            current = freshCaptcha(id, held);
        }
        log.info("CNR {}: CAPTCHA not read automatically, asking the advocate", held.cnr);
        return captchaStep(id, current);
    }

    private SubmitResult search(Pending held, String captcha) {
        try {
            return portal.searchCnr(held.session, searchPath, held.cnr, captcha);
        } catch (IOException | RuntimeException e) {
            log.warn("eCourts case search for CNR {} failed: {}", held.cnr, e.getMessage());
            throw new IllegalArgumentException("Could not read the case from eCourts right now, try again in a moment");
        }
    }

    private Step conclude(String id, Pending held, SubmitResult result) {
        if (result.html() == null) {
            forget(id);
            String why = result.message() == null || result.message().isBlank() ? "" : " (" + result.message() + ")";
            throw new IllegalArgumentException("eCourts has no case with CNR " + held.cnr + why);
        }

        ParsedCase parsed = PortalCaseParser.parse(result.html());
        if (!parsed.found()) {
            log.warn("Case page for CNR {} could not be read: {}", held.cnr, abbreviate(result.html()));
            forget(id);
            throw new IllegalArgumentException("The case page of eCourts could not be read. Fill in the case details manually");
        }
        if (!parsed.cnr().equalsIgnoreCase(held.cnr)) {
            forget(id);
            throw new IllegalArgumentException("eCourts answered with a different case. Try again");
        }

        held.parsed = parsed;
        return new Step(DONE, id, null, "", EcourtsCaseService.detailOf(parsed));
    }

    private Step nextCaptcha(String id, Pending held, String message) {
        return new Step(CAPTCHA, id, dataUrl(freshCaptcha(id, held)), message, null);
    }

    private byte[] freshCaptcha(String id, Pending held) {
        try {
            return portal.captcha(held.session);
        } catch (IOException | RuntimeException e) {
            forget(id);
            throw new IllegalArgumentException("Could not get a new CAPTCHA from eCourts, try again in a moment");
        }
    }

    private static Step captchaStep(String id, byte[] image) {
        return new Step(CAPTCHA, id, dataUrl(image), "", null);
    }

    private static String dataUrl(byte[] image) {
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(image);
    }

    // The advocate's own open lookup, or null
    private Pending owned(Long userId, String id) {
        synchronized (open) {
            Pending p = id == null ? null : open.get(id);
            if (p == null || !p.userId.equals(userId)) return null;
            if (p.created.isBefore(Instant.now().minus(ttl))) { open.remove(id); p.cancelled = true; return null; }
            return p;
        }
    }

    private void forget(String id) {
        synchronized (open) {
            Pending p = open.remove(id);
            if (p != null) p.cancelled = true;
        }
    }

    private void dropOldest(Long userId) {
        List<String> mine = new ArrayList<>();
        open.forEach((id, p) -> { if (p.userId.equals(userId)) mine.add(id); });
        while (mine.size() >= MAX_OPEN_PER_USER) {
            Pending p = open.remove(mine.remove(0));
            if (p != null) p.cancelled = true;
        }
    }

    // A short reason for the message, so a failure can be told apart: no network, portal refused, page changed
    private static String reasonOf(Exception e) {
        String m = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        m = m.replaceAll("\\s+", " ").trim();
        return m.length() > 90 ? m.substring(0, 90) + "…" : m;
    }

    private static Step expired() {
        return new Step(EXPIRED, null, null, "This session expired, start again", null);
    }

    private static String abbreviate(String body) {
        String flat = body == null ? "" : body.replaceAll("\\s+", " ").trim();
        return flat.length() > 400 ? flat.substring(0, 400) + "…" : flat;
    }
}