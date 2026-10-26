package com.internyay.service;

import com.internyay.entity.Hearing;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.HearingRepository;
import com.internyay.scraper.DistrictPortalClient;
import com.internyay.scraper.DistrictPortalClient.PortalSession;
import com.internyay.scraper.DistrictPortalClient.SubmitResult;
import com.internyay.scraper.PortalCaseParser;
import com.internyay.scraper.PortalCaseParser.OrderRow;
import com.internyay.scraper.PortalCaseParser.ParsedCase;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

// Reads a case from the eCourts Services portal (case status by CNR) while the advocate types the CAPTCHA the portal
// shows, in three calls: start (CAPTCHA image), answer (case details, or a new CAPTCHA when the answer was wrong).
//
// Once the portal has accepted the CAPTCHA the orders of the case are downloaded in the background right away, on the
// same portal session, into memory. When the case is then saved, CaseService claims the lookup (the token the form
// carries) and the orders are attached to their hearings as soon as they are all in. A lookup nobody saves is dropped
// after the session time is over
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

    private record StagedOrder(OrderRow row, byte[] pdf) {}

    public static final class Pending {
        private final Long userId;
        private final String cnr;
        private final PortalSession session;
        private final Instant created = Instant.now();
        private volatile ParsedCase parsed;
        private volatile boolean cancelled;
        private volatile CompletableFuture<List<StagedOrder>> orders;

        private Pending(Long userId, String cnr, PortalSession session) {
            this.userId = userId;
            this.cnr = cnr;
            this.session = session;
        }
    }

    // How many lookups one advocate can keep open at once (the oldest is dropped)
    private static final int MAX_OPEN_PER_USER = 3;
    private static final long MAX_PDF_BYTES = 25L * 1024 * 1024;

    private final DistrictPortalClient portal;
    private final CaseRepository caseRepo;
    private final HearingRepository hearingRepo;
    private final HearingService hearingService;
    private final OrderDownloadTracker downloads;
    private final List<String> pages;
    private final String searchPath;
    private final String displayPdfPath;
    private final Duration ttl;
    private static final int MAX_FAILED_IN_A_ROW = 3;
    private final long orderDelayMs;
    private final long maxStagedBytes;
    private final String stateCode;

    private final Map<String, Pending> open = new LinkedHashMap<>();
    // Downloads from the portal, and the attaching of the downloaded orders to a saved case. Two pools: an attach waits
    // for its downloads, so with one shared pool a few cases saved together could fill it with waiting attaches and
    // leave the downloads without a thread (the orders then never arrived)
    private final ExecutorService worker = Executors.newFixedThreadPool(1, r -> {
        Thread t = new Thread(r, "cnr-orders");
        t.setDaemon(true);
        return t;
    });
    private final ExecutorService attacher = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "cnr-orders-attach");
        t.setDaemon(true);
        return t;
    });

    public CnrLookupService(
            DistrictPortalClient portal,
            CaseRepository caseRepo,
            HearingRepository hearingRepo,
            HearingService hearingService,
            OrderDownloadTracker downloads,
            @Value("${cnr.portal.page:casestatus/index,cnr_status/index}") String pages,
            @Value("${cnr.portal.path.search:cnr_status/searchByCNR/}") String searchPath,
            @Value("${cnr.portal.path.display-pdf:home/display_pdf}") String displayPdfPath,
            @Value("${cnr.portal.session-ttl-minutes:30}") int ttlMinutes,
            @Value("${cnr.portal.order-delay-ms:2000}") long orderDelayMs,
            @Value("${cnr.portal.max-staged-mb:80}") int maxStagedMb,
            @Value("${causelist.district.state-code:26}") String stateCode) {
        this.portal = portal;
        this.caseRepo = caseRepo;
        this.hearingRepo = hearingRepo;
        this.hearingService = hearingService;
        this.downloads = downloads;
        this.pages = java.util.Arrays.stream(pages.split(",")).map(String::trim).filter(v -> !v.isEmpty()).toList();
        this.searchPath = searchPath;
        this.displayPdfPath = displayPdfPath;
        this.ttl = Duration.ofMinutes(Math.max(2, ttlMinutes));
        this.orderDelayMs = Math.max(0, orderDelayMs);
        this.maxStagedBytes = Math.max(5, maxStagedMb) * 1024L * 1024L;
        this.stateCode = stateCode;
    }

    @PreDestroy
    void shutdown() {
        worker.shutdownNow();
        attacher.shutdownNow();
    }

    // ---- the advocate's calls -----------------------------------------------------------------------------------

    // Opens a portal session for the CNR and returns its CAPTCHA
    public Step start(Long userId, String rawCnr) {

        String cnr = EcourtsCaseService.normalizeCnr(rawCnr);
        if (cnr == null) throw new IllegalArgumentException("Enter the 16-character CNR number");
        if (caseRepo.existsByUser_IdAndCnrNoIgnoreCase(userId, cnr))
            throw new IllegalArgumentException("You already have a case with this CNR number (" + cnr + ")");

        Pending held;
        String image;
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
            image = captchaOf(session);
        } catch (IOException | RuntimeException e) {
            log.warn("eCourts portal session for CNR {} could not be opened ({}): {}", cnr, e.getClass().getSimpleName(), e.getMessage(), e);
            throw new IllegalArgumentException("Could not reach eCourts right now (" + reasonOf(e) + "), try again in a moment");
        }

        String id = UUID.randomUUID().toString();
        synchronized (open) {
            dropOldest(userId);
            open.put(id, held);
        }
        return new Step(CAPTCHA, id, image, "", null);
    }

    // Sends the typed CAPTCHA. A wrong one gives a new image; the right one gives the case
    public Step answer(Long userId, String sessionId, String captcha) {

        Pending held = owned(userId, sessionId);
        if (held == null) return expired();
        if (captcha == null || captcha.isBlank()) throw new IllegalArgumentException("Type the CAPTCHA shown");

        SubmitResult result;
        try {
            result = portal.searchCnr(held.session, searchPath, held.cnr, captcha);
        } catch (IOException | RuntimeException e) {
            log.warn("eCourts case search for CNR {} failed: {}", held.cnr, e.getMessage());
            throw new IllegalArgumentException("Could not read the case from eCourts right now, try again in a moment");
        }

        if (result.html() == null) {
            if (result.captchaRejected()) return nextCaptcha(sessionId, held, "The CAPTCHA was wrong, type the new one");
            forget(sessionId);
            String why = result.message() == null || result.message().isBlank() ? "" : " (" + result.message() + ")";
            throw new IllegalArgumentException("eCourts has no case with CNR " + held.cnr + why);
        }

        ParsedCase parsed = PortalCaseParser.parse(result.html());
        if (!parsed.found()) {
            log.warn("Case page for CNR {} could not be read: {}", held.cnr, abbreviate(result.html()));
            forget(sessionId);
            throw new IllegalArgumentException("The case page of eCourts could not be read. Fill in the case details manually");
        }
        if (!parsed.cnr().equalsIgnoreCase(held.cnr)) {
            forget(sessionId);
            throw new IllegalArgumentException("eCourts answered with a different case. Try again");
        }

        held.parsed = parsed;
        stageOrders(held);
        return new Step(DONE, sessionId, null, "", EcourtsCaseService.detailOf(parsed));
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

    // The lookup behind a form that is being saved: its history, and the orders on their way. Null when the token is
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

    // Attaches the downloaded orders to the hearings of the saved case, once the case is committed. Runs in the
    // background: the advocate does not wait for it
    public void attachOrdersAfterSave(Long caseId, Long userId, Claim claim) {
        if (claim == null || claim.lookup().orders == null) return;

        // Marked at once: the case screen opens right after the save and must not offer the fetch button meanwhile
        downloads.begin(caseId);
        Runnable start = () -> attacher.submit(() -> attach(caseId, userId, claim.lookup()));

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { start.run(); }
                @Override public void afterCompletion(int status) { if (status != STATUS_COMMITTED) downloads.end(caseId); }
            });
        } else {
            start.run();
        }
    }

    // ---- background work ----------------------------------------------------------------------------------------

    // Downloads the orders of the case into memory, one at a time on the portal session
    private void stageOrders(Pending held) {

        // One order per hearing date: a hearing keeps one order (the first of that date)
        Map<LocalDate, OrderRow> byDate = new LinkedHashMap<>();
        for (OrderRow o : held.parsed.orders()) {
            if (o.link() != null && o.date() != null) byDate.putIfAbsent(o.date(), o);
        }
        if (byDate.isEmpty()) {
            log.info("CNR {}: no downloadable order links on the case page ({} order row(s))", held.cnr, held.parsed.orders().size());
            return;
        }

        List<OrderRow> todo = new ArrayList<>(byDate.values());
        held.orders = CompletableFuture.supplyAsync(() -> {
            List<StagedOrder> got = new ArrayList<>();
            long bytes = 0;
            int failed = 0;
            int failedInARow = 0;

            for (OrderRow o : todo) {
                if (held.cancelled || Thread.currentThread().isInterrupted()) break;
                try {
                    byte[] pdf = portal.orderPdf(held.session, displayPdfPath, o.link());
                    if (pdf == null) {
                        // The portal sometimes answers an order request with a page instead of the file: ask once more
                        try { Thread.sleep(Math.max(1500, orderDelayMs)); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                        pdf = portal.orderPdf(held.session, displayPdfPath, o.link());
                    }
                    if (pdf == null) {
                        failed++;
                        if (++failedInARow >= MAX_FAILED_IN_A_ROW) { log.warn("CNR {}: {} orders in a row failed, stopping the batch", held.cnr, failedInARow); break; }
                        continue;
                    }
                    failedInARow = 0;
                    if (pdf.length > MAX_PDF_BYTES || bytes + pdf.length > maxStagedBytes) {
                        log.warn("CNR {} order {} not kept: {} bytes", held.cnr, o.number(), pdf.length);
                        failed++;
                        continue;
                    }
                    bytes += pdf.length;
                    got.add(new StagedOrder(o, pdf));
                } catch (IOException | RuntimeException e) {
                    failed++;
                    log.warn("CNR {} order {} not downloaded: {}", held.cnr, o.number(), e.getMessage());
                    if (++failedInARow >= MAX_FAILED_IN_A_ROW) { log.warn("CNR {}: {} orders in a row failed, stopping the batch", held.cnr, failedInARow); break; }
                }
                if (orderDelayMs > 0) {
                    try { Thread.sleep(orderDelayMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                }
            }
            log.info("CNR {}: {} of {} order(s) downloaded from eCourts ({} failed)", held.cnr, got.size(), todo.size(), failed);
            return got;
        }, worker);
    }

    // Waits for the downloads of a saved case and puts each order on the hearing of its date
    private void attach(Long caseId, Long userId, Pending held) {
        try {
            attachAll(caseId, userId, held);
        } finally {
            downloads.end(caseId);
        }
    }

    private void attachAll(Long caseId, Long userId, Pending held) {
        List<StagedOrder> got;
        try {
            got = held.orders.get(20, TimeUnit.MINUTES);
        } catch (Exception e) {
            log.warn("Orders of CNR {} were not ready: {}", held.cnr, e.getMessage());
            return;
        }

        int saved = 0;
        for (StagedOrder s : got) {
            try {
                Hearing h = hearingRepo.findByLegalCase_IdAndUser_IdAndDate(caseId, userId, s.row().date()).orElse(null);
                if (h == null) continue;
                hearingService.attachFetchedOrder(h.getId(), s.pdf(), s.row().fileName(), userId);
                saved++;
            } catch (RuntimeException e) {
                log.warn("Order {} of CNR {} could not be attached: {}", s.row().number(), held.cnr, e.getMessage());
            }
        }
        log.info("CNR {}: {} order(s) attached to the hearings of case {}", held.cnr, saved, caseId);
    }

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

    private Step nextCaptcha(String id, Pending held, String message) {
        try {
            return new Step(CAPTCHA, id, captchaOf(held.session), message, null);
        } catch (IOException | RuntimeException e) {
            forget(id);
            throw new IllegalArgumentException("Could not get a new CAPTCHA from eCourts, try again in a moment");
        }
    }

    private String captchaOf(PortalSession session) throws IOException {
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(portal.captcha(session));
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