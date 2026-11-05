package com.internyay.service;

import com.internyay.dto.CauseListRelayStep;
import com.internyay.entity.Case;
import com.internyay.entity.CauseListRunLog;
import com.internyay.entity.Hearing;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.HearingRepository;
import com.internyay.scraper.CaptchaSolverClient;
import com.internyay.scraper.CaseKey;
import com.internyay.scraper.CourtNoToken;
import com.internyay.scraper.DistrictCauseListParser;
import com.internyay.scraper.DistrictPortalClient;
import com.internyay.scraper.DistrictSiteClient;
import com.internyay.scraper.DistrictSiteClient.SiteSession;
import com.internyay.scraper.DistrictSiteUrls;
import com.internyay.scraper.DistrictPortalClient.Option;
import com.internyay.scraper.DistrictPortalClient.PortalSession;
import com.internyay.scraper.DistrictPortalClient.Selection;
import com.internyay.scraper.JudgeNameMatch;
import com.internyay.scraper.DistrictPortalClient.SubmitResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Predicate;

@Slf4j
@Service
public class DistrictCauseListRelayService {

    // The portal answered with nothing usable (no district list), so every other court room would fail the same way
    private static final class PortalUnavailableException extends IOException {
        private PortalUnavailableException(String message) {
            super(message);
        }
    }

    private static final class NothingToLookUpException extends IOException {
        private NothingToLookUpException(String message) {
            super(message);
        }
    }

    private static final List<String> NO_LIST_PHRASES = List.of("no record", "no cause list", "no data", "not published",
            "not available", "no case", "no matching", "no result", "not found");

    private static boolean noListPublished(String message) {
        if (message == null || message.isBlank()) return true;

        String lower = message.toLowerCase(Locale.ROOT);
        return NO_LIST_PHRASES.stream().anyMatch(lower::contains);
    }

    // Districts named differently on the portal than in the courts table
    private static final Map<String, String> DISTRICT_ALIASES = Map.of("rouseavenue", "New Delhi");

    private record Task(String court, String district, String courtNo, String kind, List<Long> caseIds) {}

    // What an unattended run did: court rooms found, handled, left because the CAPTCHA could not be read, failed
    public record UnattendedResult(int rooms, int done, int needCaptcha, int failed, int saved) {
        public static final UnattendedResult EMPTY = new UnattendedResult(0, 0, 0, 0, 0);
    }

    private static final class Run {
        private final java.time.LocalDate date;
        private final Deque<Task> queue = new ArrayDeque<>();
        private int total;
        private int saved;

        private Run(java.time.LocalDate date, List<Task> tasks) {
            this.date = date;
            this.queue.addAll(tasks);
            this.total = tasks.size();
        }
    }

    private static final class Pending {
        private final Run run;
        private final Task task;
        private final PortalSession session;
        private final Selection selection;
        // Set instead of session / selection when the court room is read from its district court's own website
        private final SiteSession siteSession;
        private final DistrictSiteClient.Selection siteSelection;
        private final Instant created = Instant.now();

        private Pending(Run run, Task task, PortalSession session, Selection selection) {
            this.run = run;
            this.task = task;
            this.session = session;
            this.selection = selection;
            this.siteSession = null;
            this.siteSelection = null;
        }

        private Pending(Run run, Task task, SiteSession siteSession, DistrictSiteClient.Selection siteSelection) {
            this.run = run;
            this.task = task;
            this.session = null;
            this.selection = null;
            this.siteSession = siteSession;
            this.siteSelection = siteSelection;
        }
    }

    private final CaseRepository caseRepo;
    private final HearingRepository hearingRepo;
    private final CourtService courtService;
    private final JudgeService judgeService;
    private final DistrictPortalClient portal;
    private final DistrictSiteClient site;
    private final boolean siteEnabled;
    private final CaptchaSolverClient solver;
    private final CauseListRunLogService runLog;
    private final long autoBudgetNanos;
    private final String stateCode;
    private final Duration sessionTtl;

    @Value("${causelist.district-site.captcha-length:5}")
    private int siteCaptchaLength = 5;

    private Instant lastActivity = Instant.now();

    private final Map<String, Pending> pending = new HashMap<>();
    private Run current;

    // Log row and lines of the run an admin is walking through (null when none)
    private Long currentLogId;
    private final List<String> currentLines = new ArrayList<>();
    private int currentSkipped;

    public DistrictCauseListRelayService(
            CaseRepository caseRepo,
            HearingRepository hearingRepo,
            CourtService courtService,
            JudgeService judgeService,
            DistrictPortalClient portal,
            DistrictSiteClient site,
            CaptchaSolverClient solver,
            CauseListRunLogService runLog,
            @Value("${causelist.district-site.enabled:true}") boolean siteEnabled,
            @Value("${causelist.district.auto-budget-seconds:20}") int autoBudgetSeconds,
            @Value("${causelist.district.state-code:26}") String stateCode,
            @Value("${causelist.district.session-ttl-minutes:10}") int ttlMinutes) {
        this.caseRepo = caseRepo;
        this.hearingRepo = hearingRepo;
        this.courtService = courtService;
        this.judgeService = judgeService;
        this.portal = portal;
        this.site = site;
        this.siteEnabled = siteEnabled;
        this.solver = solver;
        this.runLog = runLog;
        this.autoBudgetNanos = Math.max(5, autoBudgetSeconds) * 1_000_000_000L;
        this.stateCode = stateCode;
        this.sessionTtl = Duration.ofMinutes(Math.max(1, ttlMinutes));
    }

    public synchronized CauseListRelayStep start(java.time.LocalDate date) {
        return start(date, false);
    }

    public synchronized CauseListRelayStep start(java.time.LocalDate date, boolean refreshAll) {
        lastActivity = Instant.now();
        pending.clear();
        List<String> unusable = new ArrayList<>();
        List<Task> tasks = buildTasks(date, unusable, refreshAll);

        // A run that was left open is closed before the new one starts
        if (currentLogId != null) {
            runLog.finish(currentLogId, CauseListRunLog.Status.ABANDONED, manualTotals(),
                    "Replaced by a new run before it finished", currentLines);
        }

        current = new Run(date, tasks);
        currentLines.clear();
        currentSkipped = 0;
        currentLogId = runLog.begin(date, CauseListRunLog.Origin.MANUAL, "Admin relay").getId();
        currentLines.add("Started for " + date + ": " + tasks.size() + " court room(s) to look up"
                + (refreshAll ? ", including cases that already have a number" : ""));

        List<String> notes = new ArrayList<>(unusable);

        if (tasks.isEmpty()) {
            notes.add("Nothing to fetch: every district court case listed on this date already has its cause list number");
        }
        return next(new ArrayList<>(), String.join("; ", notes));
    }

    public synchronized CauseListRelayStep answer(String sessionId, String captcha) {
        lastActivity = Instant.now();
        Pending held = take(sessionId);

        if (held == null) {
            return expired();
        }

        SubmitResult result;

        try {
            result = submitOf(held, captcha);
        } catch (IOException | RuntimeException e) {
            log.error("District cause list submit failed: {}", e.getMessage());
            return next(new ArrayList<>(List.of(label(held.task) + ": " + e.getMessage())), "");
        }

        if (result.captchaRejected()) {
            pending.put(sessionId, held);

            try {
                return captchaStep(sessionId, held, "The CAPTCHA was not accepted, type the new one");
            } catch (RuntimeException e) {
                pending.remove(sessionId);
                return next(new ArrayList<>(List.of(label(held.task) + ": " + e.getMessage())), "");
            }
        }

        if (result.html() == null) {
            if (noListPublished(result.message())) {
                return next(new ArrayList<>(), label(held.task) + ": no cause list published for this court room yet");
            }
            return next(new ArrayList<>(List.of(label(held.task) + ": " + result.message())), "");
        }

        return next(new ArrayList<>(), save(held, result.html()));
    }

    // The page asks for this after a WORKING step: the automatic reading goes on with the next court rooms
    public synchronized CauseListRelayStep resume() {
        lastActivity = Instant.now();
        return next(new ArrayList<>(), "");
    }

    public synchronized CauseListRelayStep skip(String sessionId) {
        lastActivity = Instant.now();
        Pending held = take(sessionId);

        if (held == null) {
            return expired();
        }
        return next(new ArrayList<>(), label(held.task) + ": skipped by the admin");
    }

    public synchronized CauseListRelayStep refresh(String sessionId) {
        lastActivity = Instant.now();
        Pending held = pending.get(sessionId);

        if (held == null) {
            return expired();
        }

        try {
            return captchaStep(sessionId, held, "");
        } catch (RuntimeException e) {
            return next(new ArrayList<>(List.of(label(held.task) + ": " + e.getMessage())), "");
        }
    }

    @Scheduled(fixedDelay = 60_000L, initialDelay = 60_000L)
    void sweepIdleRun() {
        closeIdleRun();
    }

    public synchronized void closeIdleRun() {
        if (currentLogId == null) return;
        if (Duration.between(lastActivity, Instant.now()).compareTo(sessionTtl) < 0) return;

        currentLines.add("Left open: no activity for " + sessionTtl.toMinutes() + " minutes");
        runLog.finish(currentLogId, CauseListRunLog.Status.ABANDONED, manualTotals(),
                "Left open: the page was refreshed or closed before the run finished", currentLines);
        currentLogId = null;
        current = null;
        pending.clear();
    }

    private CauseListRelayStep next(List<String> skipped, String message) {
        expireOld();

        if (current == null) {
            return expired();
        }

        Run run = current;
        long deadline = System.nanoTime() + autoBudgetNanos;
        List<String> notes = new ArrayList<>();
        if (message != null && !message.isBlank()) notes.add(message);

        while (!run.queue.isEmpty()) {
            // One request must not run for minutes: after the budget the page is told to ask again
            if (solver.available() && System.nanoTime() > deadline) {
                trace(notes, skipped);
                return new CauseListRelayStep("WORKING", null, null, null, null, null, 0, run.queue.size(),
                        run.total - run.queue.size(), run.saved, String.join("; ", notes), skipped);
            }

            Task task = run.queue.poll();

            try {
                Pending held = prepareForList(run, task);

                if (solver.available()) {
                    Auto auto = readAutomatically(held);

                    if (auto != null) {
                        if (auto.error() != null) {
                            skipped.add(label(task) + ": " + auto.error());
                        } else if (auto.result().html() == null) {
                            if (noListPublished(auto.result().message())) {
                                notes.add(label(task) + ": no cause list published for this court room yet");
                            } else {
                                skipped.add(label(task) + ": " + auto.result().message());
                            }
                        } else {
                            notes.add(save(held, auto.result().html()));
                        }
                        continue;
                    }
                }

                String id = UUID.randomUUID().toString();
                CauseListRelayStep step = captchaStep(id, held, String.join("; ", notes), skipped);
                notes.add("Waiting for a CAPTCHA: " + label(task));
                trace(notes, skipped);
                pending.put(id, held);
                return step;

            } catch (PortalUnavailableException e) {
                log.warn("District cause list stopped: {}", e.getMessage());
                skipped.add(e.getMessage() + ". Stopped, " + (run.queue.size() + 1) + " court room(s) not tried");
                run.queue.clear();

            } catch (NothingToLookUpException e) {
                log.info("District cause list {}: {}", label(task), e.getMessage());
                notes.add(label(task) + ": " + e.getMessage());
                run.total--;

            } catch (IOException | RuntimeException e) {
                log.warn("District cause list task {} skipped: {}", label(task), e.getMessage());
                skipped.add(label(task) + ": " + e.getMessage());
            }
        }

        trace(notes, skipped);
        finishManualRun(run);

        return new CauseListRelayStep("DONE", null, null, null, null, null, 0, 0,
                run.total, run.saved, String.join("; ", notes), skipped);
    }

    // Adds what a step did to the manual run's log and saves its progress
    private void trace(List<String> notes, List<String> skipped) {
        if (currentLogId == null) return;

        currentLines.addAll(notes);
        currentLines.addAll(skipped);
        currentSkipped += skipped.size();
        runLog.update(currentLogId, manualTotals(), currentLines);
    }

    // Closes the log row of the manual run that just reached its end
    private void finishManualRun(Run run) {
        if (currentLogId == null) return;

        boolean nothing = run.total == 0 && currentSkipped == 0;
        String summary = nothing
                ? "Nothing to look up: every district court case on this date already has its number, or none needs one"
                : run.saved + " number(s) saved in " + run.total + " court room(s)"
                        + (currentSkipped > 0 ? "; " + currentSkipped + " skipped or failed" : "");
        currentLines.add(summary);
        CauseListRunLog.Status status = nothing ? CauseListRunLog.Status.NOTHING_TO_DO
                : currentSkipped > 0 ? CauseListRunLog.Status.PARTIAL : CauseListRunLog.Status.SUCCESS;
        runLog.finish(currentLogId, status, manualTotals(), summary, currentLines);
        currentLogId = null;
    }

    private CauseListRunLogService.Totals manualTotals() {
        Run run = current;
        if (run == null) return CauseListRunLogService.Totals.NONE;

        int handled = run.total - run.queue.size();
        return new CauseListRunLogService.Totals(0, run.total, handled, 0, currentSkipped, run.saved);
    }

    // What the automatic reading of one court room gave: the portal's answer, or the error that ends this court room
    private record Auto(SubmitResult result, String error) {}

    // Reads the CAPTCHA with the solver and submits it, with a fresh image after each refused guess. Returns null when the
    // CAPTCHA could not be read (the admin then types it as before)
    private Auto readAutomatically(Pending held) {
        int unread = 0, refused = 0;

        for (int attempt = 1; attempt <= solver.maxAttempts(); attempt++) {
            byte[] image;

            try {
                image = captchaOf(held);
            } catch (IOException | RuntimeException e) {
                log.warn("District cause list {}: CAPTCHA image could not be loaded: {}", label(held.task), e.getMessage());
                return null;
            }

            Optional<String> text = solver.solve(image, held.siteSession != null ? siteCaptchaLength : 0);

            if (text.isEmpty()) {
                unread++;
                if (!solver.available()) break;
                continue;
            }

            SubmitResult result;

            try {
                result = submitOf(held, text.get());
            } catch (IOException | RuntimeException e) {
                log.error("District cause list submit failed: {}", e.getMessage());
                return new Auto(null, e.getMessage());
            }

            if (!result.captchaRejected()) {
                log.info("District cause list {}: CAPTCHA read automatically on attempt {}", label(held.task), attempt);
                return new Auto(result, null);
            }
            refused++;
        }

        log.warn("District cause list {}: CAPTCHA not read automatically ({} not readable, {} refused by the site; solver: {}), asking the admin",
                label(held.task), unread, refused, solver.issue().isBlank() ? "no problem reported" : solver.issue());
        return null;
    }

    // Looks up a date's district cause lists with no admin present. Court rooms whose CAPTCHA the solver cannot read are
    // counted and left alone (an admin finishes them in Admin > Cause List, or the next hourly run tries again).
    // Does not touch the run an admin may have open on the page. Stops at the deadline so runs never overlap.
    public UnattendedResult runUnattended(java.time.LocalDate date, long deadlineNanos, Consumer<String> note) {
        return runUnattended(date, deadlineNanos, note, false);
    }

    public UnattendedResult runUnattended(java.time.LocalDate date, long deadlineNanos, Consumer<String> note, boolean refreshAll) {
        List<String> unusable = new ArrayList<>();
        List<Task> tasks = buildTasks(date, unusable, refreshAll);
        unusable.forEach(note);

        if (tasks.isEmpty()) return UnattendedResult.EMPTY;

        if (!solver.available()) {
            note.accept("CAPTCHA solver unavailable: " + tasks.size() + " court room(s) left for an admin or the next run");
            return new UnattendedResult(tasks.size(), 0, tasks.size(), 0, 0);
        }

        Run run = new Run(date, List.of());
        int done = 0, needCaptcha = 0, failed = 0, index = 0, nothingToLookUp = 0;

        for (Task task : tasks) {
            index++;

            if (System.nanoTime() > deadlineNanos) {
                int left = tasks.size() - index + 1;
                note.accept("Time limit reached, " + left + " court room(s) left for the next run");
                needCaptcha += left;
                break;
            }

            try {
                Pending held = prepareForList(run, task);
                Auto auto = readAutomatically(held);

                if (auto == null) {
                    needCaptcha++;
                    note.accept(label(task) + ": CAPTCHA could not be read, needs an admin");
                } else if (auto.error() != null) {
                    failed++;
                    note.accept(label(task) + ": " + auto.error());
                } else if (auto.result().html() == null) {
                    if (noListPublished(auto.result().message())) {
                        note.accept(label(task) + ": no cause list published for this court room yet");
                    } else {
                        failed++;
                        note.accept(label(task) + ": " + auto.result().message());
                    }
                } else {
                    done++;
                    note.accept(save(held, auto.result().html()));
                }

            } catch (PortalUnavailableException e) {
                int left = tasks.size() - index + 1;
                log.warn("Unattended district cause list stopped: {}", e.getMessage());
                note.accept(e.getMessage() + ". Stopped, " + left + " court room(s) not tried");
                failed += left;
                break;

            } catch (NothingToLookUpException e) {
                log.info("Unattended district cause list {}: {}", label(task), e.getMessage());
                note.accept(label(task) + ": " + e.getMessage());
                nothingToLookUp++;

            } catch (IOException | RuntimeException e) {
                failed++;
                log.warn("Unattended district cause list task {} failed: {}", label(task), e.getMessage());
                note.accept(label(task) + ": " + e.getMessage());
            }
        }

        return new UnattendedResult(tasks.size() - nothingToLookUp, done, needCaptcha, failed, run.saved);
    }

    // What a single-case district lookup gave. NEEDS_CAPTCHA carries a ticket when the court room is ready for the user's CAPTCHA
    public enum CaseOutcome { FOUND, NOT_LISTED, NEEDS_CAPTCHA, UNSUPPORTED, FAILED }

    // The portal session of a court room waiting for a typed CAPTCHA: its session, how to send the CAPTCHA, and how to turn the
    // portal's answer into the lookup's result
    public record Ticket(PortalSession session, ManualCaptchaDesk.Submit submit, java.util.function.Function<SubmitResult, CaseRefresh> finish) {}

    public record CaseRefresh(CaseOutcome outcome, Integer serial, String message, Ticket ticket) {
        public CaseRefresh(CaseOutcome outcome, Integer serial, String message) {
            this(outcome, serial, message, null);
        }
    }

    // Looks up one district court case in its court room's cause list for the date and saves the number found. Used by the
    // dashboard's refresh button, so only that case's court room is asked of the portal. The CAPTCHA is read by the solver;
    // when it cannot be read the result carries a ticket, so the caller can ask the user to type it (an admin's relay is not
    // involved and is left untouched)
    public CaseRefresh refreshOne(Case c, java.time.LocalDate date) {
        if (c.getCourtPlace() == null || c.getCourtPlace().isHighCourt()) {
            return new CaseRefresh(CaseOutcome.UNSUPPORTED, null, "This case is not in a district court");
        }

        if (blank(c.getCourtNo()) || blank(c.getCaseNo())) {
            return new CaseRefresh(CaseOutcome.UNSUPPORTED, null, "Add the court number and case number to look up the cause list");
        }

        if (CaseKey.parse(c.getCaseNo()).isEmpty()) {
            return new CaseRefresh(CaseOutcome.UNSUPPORTED, null, "The case number needs its type and year (like CR Cases/5837/2018) "
                    + "to be found in the cause list");
        }

        if (courtService.juvenileBoardCases().test(c)) {
            return new CaseRefresh(CaseOutcome.UNSUPPORTED, null, "Juvenile Justice Board cases are not in the published cause list");
        }

        Task task = new Task(c.getCourtPlace().getCourt(), c.getCourtPlace().getDistrict(), c.getCourtNo(), kind(c), List.of(c.getId()));
        Run run = new Run(date, List.of());

        try {
            Pending held = prepare(run, task);
            Auto auto = solver.available() ? readAutomatically(held) : null;

            if (auto == null) {
                // The reader could not read the CAPTCHA (or there is none): the user types it on this same portal session
                Ticket ticket = new Ticket(held.session,
                        captcha -> portal.submit(held.session, held.selection, date, captcha),
                        result -> finishOne(held, c, result));
                return new CaseRefresh(CaseOutcome.NEEDS_CAPTCHA, null, "The CAPTCHA could not be read automatically", ticket);
            }

            if (auto.error() != null) {
                return new CaseRefresh(CaseOutcome.FAILED, null, auto.error());
            }

            return finishOne(held, c, auto.result());

        } catch (NothingToLookUpException e) {
            return new CaseRefresh(CaseOutcome.UNSUPPORTED, null, e.getMessage());

        } catch (IOException | RuntimeException e) {
            log.warn("District cause list refresh for case {} failed: {}", c.getId(), e.getMessage());
            return new CaseRefresh(CaseOutcome.FAILED, null, e.getMessage());
        }
    }

    // The portal's answer for one case: its serial in the list is saved, or the reason there is none is given
    private CaseRefresh finishOne(Pending held, Case c, SubmitResult result) {
        String html = result.html();

        if (html == null) {
            String why = result.message() == null || result.message().isBlank()
                    ? "No cause list is published for this court on that date yet" : result.message();
            return new CaseRefresh(CaseOutcome.NOT_LISTED, null, why);
        }

        Integer serial = serialOf(c.getCaseNo(), DistrictCauseListParser.serialNumbers(html));
        save(held, html);

        return serial == null
                ? new CaseRefresh(CaseOutcome.NOT_LISTED, null, "This case is not in the court's cause list for that date")
                : new CaseRefresh(CaseOutcome.FOUND, serial, null);
    }

    private Pending prepare(Run run, Task task) throws IOException {
        PortalSession session = portal.open();

        List<Option> districts = portal.districts(session, stateCode);

        if (districts.isEmpty()) {
            throw new PortalUnavailableException("The eCourts Services portal returned no districts, "
                    + "it may be refusing requests from this server or its page changed");
        }

        // The app's district can differ from the portal's (Rouse Avenue Courts sit under New Delhi there)
        Option district = pick(districts, DISTRICT_ALIASES.getOrDefault(squash(task.district()), task.district()));
        List<Option> complexes = district == null ? List.of() : portal.complexes(session, stateCode, district.value());
        Option complex = district == null ? null : pick(complexes, task.court());

        if (complex == null) {
            // Look for the court complex under the other districts, the portal's district may just be named differently
            for (Option other : districts) {
                if (district != null && other.value().equals(district.value())) continue;

                List<Option> found = portal.complexes(session, stateCode, other.value());
                Option match = pick(found, task.court());

                if (match != null) {
                    district = other;
                    complexes = found;
                    complex = match;
                    break;
                }
            }
        }

        if (district == null) {
            throw new IOException("district '" + task.district() + "' not found on the portal ("
                    + offered(districts, "districts") + ")");
        }

        if (complex == null) {
            throw new IOException("court complex '" + task.court() + "' not found on the portal ("
                    + offered(complexes, "court complexes") + ")");
        }

        String[] parts = complex.value().split("@");
        String complexCode = parts[0];
        String complexEstablishment = parts.length > 1 ? parts[1] : "";

        List<Option> establishments = portal.establishments(session, stateCode, district.value(), complexCode);
        List<String> establishmentCodes = new ArrayList<>();
        establishments.forEach(o -> establishmentCodes.add(o.value()));

        if (establishmentCodes.isEmpty()) {
            establishmentCodes.add(complexEstablishment);
        }

        List<String> offeredCourts = new ArrayList<>();
        List<Option> allCourts = new ArrayList<>();
        String ambiguous = null;

        // The portal lists judges ("49-Sh. Name-Additional Sessions Judge"), its leading number is its own id and not the
        // court room, so the court room is matched through the judge Quick Access has for it
        String judgeName = judgeNameOf(task);

        // The court code saved on the Quick Access listing is the portal's own court value, so it is tried first
        String storedCode = judgeService.courtCodeFor(task.court(), task.district(), task.courtNo());

        for (String establishmentCode : establishmentCodes) {
            List<Option> courts = portal.courts(session, stateCode, district.value(), complexCode, establishmentCode);
            courts.forEach(o -> offeredCourts.add(o.text()));
            allCourts.addAll(courts);

            if (storedCode != null) {
                Option byCode = courts.stream()
                        .filter(o -> o.value() != null && o.value().trim().equalsIgnoreCase(storedCode))
                        .findFirst()
                        .orElse(null);

                if (byCode != null) {
                    Selection selection = new Selection(stateCode, district.value(), complexCode, establishmentCode,
                            byCode.value(), byCode.text(), task.kind());
                    log.info("Court no. '{}' of {} / {} matched by court code {} to portal court '{}'", task.courtNo(),
                            task.court(), task.district(), storedCode, byCode.text());
                    return new Pending(run, task, session, selection);
                }
            }

            CourtMatch match = matchCourt(courts, task, judgeName);
            if (match.ambiguous() != null) ambiguous = match.ambiguous();
            Option court = match.court();

            if (court != null) {
                Selection selection = new Selection(stateCode, district.value(), complexCode, establishmentCode,
                        court.value(), court.text(), task.kind());
                log.info("Court no. '{}' of {} / {} matched to portal court '{}'", task.courtNo(), task.court(),
                        task.district(), court.text());
                return new Pending(run, task, session, selection);
            }
        }

        if (storedCode != null) {
            log.warn("Court code {} of {} / {} court no. '{}' is not in the portal's court list, matching by judge name instead",
                    storedCode, task.court(), task.district(), task.courtNo());
        }

        if (judgeName == null) {
            throw new NothingToLookUpException("no judge is listed in Quick Access for court no. '" + task.courtNo()
                    + "', nothing to look up");
        }

        String sample = offeredCourts.stream().limit(12).collect(java.util.stream.Collectors.joining("; "));
        log.warn("Court no. '{}' not matched among {} portal court(s) of {} / {}: {}", task.courtNo(),
                offeredCourts.size(), task.court(), task.district(), sample);
        throw new IOException("judge '" + judgeName + "' (court no. '" + task.courtNo() + "') not found in the portal's court list ("
                + offeredCourts.size() + " courts); "
                + (ambiguous != null ? "several portal courts fit, none could be chosen: " + ambiguous
                        : closest(allCourts, judgeName)));
    }

    // The court of a list (the portal's or a district site's) that belongs to the task's court room, and the options that
    // tied when several fit. First by the judge Quick Access holds for the court room, then by a court / room number the
    // option text mentions, then by a room code like "FC-46"
    private record CourtMatch(Option court, String ambiguous) {}

    private CourtMatch matchCourt(List<Option> courts, Task task, String judgeName) {
        List<Option> tied = judgeName == null ? List.of() : JudgeNameMatch.topTied(courts, Option::text, judgeName);

        // A judge can hold two courts (a regular one and an evening court): prefer the regular one
        if (tied.size() > 1) {
            List<Option> regular = tied.stream().filter(o -> !o.text().toLowerCase().contains("evening")).toList();

            if (regular.size() == 1) {
                tied = regular;
            }
        }

        Option court = tied.size() == 1 ? tied.get(0) : null;
        String ambiguous = tied.size() > 1
                ? tied.stream().map(Option::text).collect(java.util.stream.Collectors.joining(" | ")) : null;

        if (court == null) {
            List<Option> mentioned = courts.stream()
                    .filter(o -> CourtNoToken.mentions(o.text(), task.courtNo()))
                    .toList();

            if (mentioned.size() == 1) {
                court = mentioned.get(0);
            }
        }

        // Family courts are listed by their own room code ("FC-46") and carry no judge name in the list, so the code
        // itself is looked for. Only a code with letters in it: a bare number would fit too many courts
        if (court == null && task.courtNo() != null && task.courtNo().matches("(?i).*[a-z].*\\d.*")) {
            String code = squash(task.courtNo());
            List<Option> byRoomCode = courts.stream().filter(o -> squash(o.text()).contains(code)).toList();

            if (byRoomCode.size() == 1) {
                court = byRoomCode.get(0);
            }
        }
        return new CourtMatch(court, ambiguous);
    }

    // A court room ready to be asked for its cause list. Cause lists are read from the district court's own website
    // (southdelhi.dcourts.gov.in and the like); a district with no website of its own, or the site switched off in the
    // settings (causelist.district-site.enabled), is read from the eCourts Services portal as before
    private Pending prepareForList(Run run, Task task) throws IOException {
        if (siteEnabled) {
            Optional<String> base = DistrictSiteUrls.baseUrlFor(task.district());

            if (base.isPresent()) {
                return prepareSite(run, task, base.get());
            }
            log.info("{} has no district court website listed, reading its cause list from the eCourts Services portal",
                    task.district());
        }
        return prepare(run, task);
    }

    private Pending prepareSite(Run run, Task task, String baseUrl) throws IOException {
        SiteSession session = site.open(baseUrl);
        List<Option> complexes = site.complexes(session);
        Option complex = pick(complexes, task.court());

        if (complex == null) {
            throw new IOException("court complex '" + task.court() + "' not found on " + baseUrl + " ("
                    + offered(complexes, "court complexes") + ")");
        }

        List<Option> courts = site.courts(session, complex);

        if (courts.isEmpty()) {
            throw new IOException(baseUrl + " returned no courts for " + complex.text());
        }

        String judgeName = judgeNameOf(task);
        Option byCode = byStoredCode(courts, judgeService.courtCodeFor(task.court(), task.district(), task.courtNo()));

        if (byCode != null) {
            log.info("Court no. '{}' of {} / {} matched by court code to '{}' on {}", task.courtNo(), task.court(),
                    task.district(), byCode.text(), baseUrl);

            return new Pending(run, task, session,
                    new DistrictSiteClient.Selection(complex.value(), byCode.value(), byCode.text(), task.kind()));
        }

        CourtMatch match = matchCourt(courts, task, judgeName);

        if (match.court() == null) {
            if (judgeName == null) {
                throw new NothingToLookUpException("no judge is listed in Quick Access for court no. '" + task.courtNo()
                        + "', nothing to look up");
            }

            String sample = courts.stream().limit(12).map(Option::text).collect(java.util.stream.Collectors.joining("; "));
            log.warn("Court no. '{}' not matched among {} court(s) of {} / {} on {}: {}", task.courtNo(), courts.size(),
                    task.court(), task.district(), baseUrl, sample);
            throw new IOException("judge '" + judgeName + "' (court no. '" + task.courtNo() + "') not found in the district website's court list ("
                    + courts.size() + " courts); "
                    + (match.ambiguous() != null ? "several courts fit, none could be chosen: " + match.ambiguous()
                            : closest(courts, judgeName)));
        }

        log.info("Court no. '{}' of {} / {} matched to '{}' on {}", task.courtNo(), task.court(), task.district(),
                match.court().text(), baseUrl);

        return new Pending(run, task, session,
                new DistrictSiteClient.Selection(complex.value(), match.court().value(), match.court().text(), task.kind()));
    }

    private static Option byStoredCode(List<Option> courts, String storedCode) {
        if (storedCode == null || storedCode.isBlank()) return null;

        String code = storedCode.trim();
        String number = code.substring(code.lastIndexOf('^') + 1).trim();
        if (number.isEmpty()) return null;

        List<Option> exact = courts.stream()
                .filter(o -> o.value() != null && o.value().trim().equalsIgnoreCase(code))
                .toList();
        if (exact.size() == 1) return exact.get(0);

        java.util.regex.Pattern lead = java.util.regex.Pattern.compile("^\\s*" + java.util.regex.Pattern.quote(number) + "(?!\\d)");
        List<Option> byNumber = courts.stream()
                .filter(o -> (o.value() != null && o.value().trim().equals(number)) || lead.matcher(o.text()).find())
                .toList();

        return byNumber.size() == 1 ? byNumber.get(0) : null;
    }

    // The CAPTCHA picture of a court room, from whichever place its list is read
    private byte[] captchaOf(Pending held) throws IOException {
        return held.siteSession != null ? site.captcha(held.siteSession) : portal.captcha(held.session);
    }

    private SubmitResult submitOf(Pending held, String captcha) throws IOException {
        return held.siteSession != null
                ? site.submit(held.siteSession, held.siteSelection, held.run.date, captcha)
                : portal.submit(held.session, held.selection, held.run.date, captcha);
    }

    private CauseListRelayStep captchaStep(String id, Pending held, String message) {
        return captchaStep(id, held, message, List.of());
    }

    private CauseListRelayStep captchaStep(String id, Pending held, String message, List<String> skipped) {
        String image;

        try {
            image = "data:image/png;base64," + Base64.getEncoder().encodeToString(captchaOf(held));
        } catch (IOException e) {
            throw new IllegalStateException("CAPTCHA image could not be loaded: " + e.getMessage(), e);
        }

        Run run = held.run;
        return new CauseListRelayStep("CAPTCHA", id, image, held.task.court(), held.task.district(),
                held.task.courtNo(), held.task.caseIds().size(), run.queue.size(),
                run.total - run.queue.size() - 1, run.saved, message, skipped);
    }

    private String save(Pending held, String html) {
        Map<CaseKey, Integer> serials = DistrictCauseListParser.serialNumbers(html);
        Map<Integer, List<Long>> idsBySerial = new LinkedHashMap<>();
        List<Case> asked = caseRepo.findAllById(held.task.caseIds());
        List<String> notListed = new ArrayList<>();
        java.time.LocalDate date = held.run.date;

        for (Case c : asked) {
            Integer serial = serialOf(c.getCaseNo(), serials);

            if (serial != null) {
                idsBySerial.computeIfAbsent(serial, k -> new ArrayList<>()).add(c.getId());
            } else {
                notListed.add(c.getCaseNo());
                CaseKey.parse(c.getCaseNo()).ifPresent(k -> log.info("Case {} not in the list; entries with number {}: {}",
                        c.getCaseNo(), k.number(), serials.keySet().stream().filter(o -> o.number() == k.number()).toList()));
            }
        }

        if (idsBySerial.isEmpty()) {
            log.info("Cause list for {} had {} serial(s) but none matched the {} case(s) asked for; list sample {}, case sample {}",
                    held.task.courtNo(), serials.size(), held.task.caseIds().size(),
                    serials.keySet().stream().limit(5).toList(),
                    asked.stream().map(Case::getCaseNo).limit(5).toList());
        }

        Map<Long, Case> byId = new HashMap<>();
        asked.forEach(c -> byId.put(c.getId(), c));

        int saved = 0;

        for (Map.Entry<Integer, List<Long>> entry : idsBySerial.entrySet()) {
            List<Long> ids = entry.getValue();

            // The case row only holds the number of its next hearing date. A case already moved on to a later date
            // (its hearing of this date was recorded as heard) keeps the number on that hearing only
            List<Long> stillOnThisDate = ids.stream()
                    .filter(id -> date.equals(byId.get(id).getNextHearing()))
                    .toList();

            if (!stillOnThisDate.isEmpty()) {
                caseRepo.saveCauseListNo(entry.getKey(), date, stillOnThisDate);
            }
            hearingRepo.saveCauseListNo(entry.getKey(), date, ids);
            saved += ids.size();
        }

        String message = label(held.task) + ": " + saved + " cause list number(s) saved";

        if (!notListed.isEmpty()) {
            message += "; not found in the list: " + String.join(", ", notListed.stream().limit(6).toList())
                    + (notListed.size() > 6 ? " and " + (notListed.size() - 6) + " more" : "");
        }

        held.run.saved += saved;
        return message;
    }

    // Serial of a case in the list. The type is matched exactly first; the portal names types its own way (a cheque case
    // saved as "CR Cases" is "CC NI ACT" there), so when the type differs a number and year that fit one entry count
    private static Integer serialOf(String caseNo, Map<CaseKey, Integer> serials) {
        Optional<CaseKey> key = CaseKey.parse(caseNo);

        if (key.isEmpty()) return null;
        if (serials.containsKey(key.get())) return serials.get(key.get());

        List<Integer> sameNumber = serials.entrySet().stream()
                .filter(e -> e.getKey().number() == key.get().number() && e.getKey().year() == key.get().year())
                .map(Map.Entry::getValue).distinct().toList();

        return sameNumber.size() == 1 ? sameNumber.get(0) : null;
    }

    // District cases to look up for a date: the cases whose next hearing is that date, and also the cases that were
    // listed that day but have since been moved to a later date (their hearing of that day is in the hearing history)
    private List<Task> buildTasks(java.time.LocalDate date, List<String> unusable, boolean refreshAll) {
        Predicate<Case> juvenile = courtService.juvenileBoardCases();
        Map<String, List<Case>> groups = new LinkedHashMap<>();
        java.util.Set<Long> seen = new java.util.HashSet<>();

        for (Case c : caseRepo.findByNextHearing(date)) {
            // Already has its cause list number for this date (for example saved earlier), no need to ask the portal again
            boolean numbered = !refreshAll && c.getCauseListNo() != null && date.equals(c.getListingDate());
            addCandidate(c, numbered, juvenile, seen, groups, unusable);
        }

        for (Hearing h : hearingRepo.findAllWithCaseByDate(date)) {
            addCandidate(h.getLegalCase(), !refreshAll && h.getCauseListNo() != null, juvenile, seen, groups, unusable);
        }

        List<Task> tasks = new ArrayList<>();

        for (List<Case> group : groups.values()) {
            Case first = group.get(0);
            tasks.add(new Task(first.getCourtPlace().getCourt(), first.getCourtPlace().getDistrict(),
                    first.getCourtNo(), kind(first), group.stream().map(Case::getId).toList()));
        }

        tasks.sort(Comparator.comparing(Task::court).thenComparing(Task::district).thenComparing(Task::courtNo));
        return tasks;
    }

    private static void addCandidate(Case c, boolean numbered, Predicate<Case> juvenile, java.util.Set<Long> seen,
                                     Map<String, List<Case>> groups, List<String> unusable) {
        if (numbered || juvenile.test(c) || c.getCourtPlace() == null || c.getCourtPlace().isHighCourt()) return;
        if (blank(c.getCourtNo()) || blank(c.getCaseNo())) return;
        if (!seen.add(c.getId())) return;

        // The list is matched by case type, number and year, a case number written any other way can never be found
        if (CaseKey.parse(c.getCaseNo()).isEmpty()) {
            unusable.add("'" + c.getCaseNo() + "' (" + c.getTitle() + ") skipped: the case number needs its type and "
                    + "year (like CR Cases/5837/2018) to be found in the cause list");
            return;
        }

        String key = c.getCourtPlace().getCourt() + "|" + c.getCourtPlace().getDistrict() + "|"
                + CourtNoToken.of(c.getCourtNo()) + "|" + kind(c);
        groups.computeIfAbsent(key, k -> new ArrayList<>()).add(c);
    }

    private static String kind(Case c) {
        String nature = c.getCaseNature();
        return nature != null && nature.toLowerCase(Locale.ROOT).contains("crim") ? "cri" : "civ";
    }

    // Portal courts that look a little like the judge's name, so a spelling difference or a transfer can be seen
    private static String closest(List<Option> courts, String judgeName) {
        List<Option> similar = JudgeNameMatch.similar(courts, Option::text, judgeName, 3);

        if (similar.isEmpty()) {
            return "no portal court has a similar name, the judge may have moved or is spelt differently in Quick Access";
        }
        return "closest on the portal: " + similar.stream().map(Option::text).collect(java.util.stream.Collectors.joining(" | "));
    }

    private String judgeNameOf(Task task) {
        Map<Long, String> names = judgeService.judgeNamesFor(caseRepo.findAllById(task.caseIds()));
        return names.values().stream().filter(n -> n != null && !n.isBlank()).findFirst().orElse(null);
    }

    private static Option pick(List<Option> options, String name) {
        String wanted = squash(name);

        return options.stream()
                .filter(o -> {
                    String text = squash(o.text());
                    return text.equals(wanted) || text.contains(wanted) || wanted.contains(text);
                })
                .min(Comparator.comparingInt((Option o) -> squash(o.text()).equals(wanted) ? 0 : 1)
                        .thenComparingInt(o -> o.text().length()))
                .orElse(null);
    }

    // Names the portal answered with, so a mismatch can be seen in the admin log
    private static String offered(List<Option> options, String what) {
        if (options.isEmpty()) {
            return "the portal returned no " + what + ", it may be refusing requests from this server or its page changed";
        }
        return "the portal has: " + options.stream().map(Option::text).collect(java.util.stream.Collectors.joining(", "));
    }

    private static String squash(String text) {
        return text == null ? "" : text.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static boolean blank(String text) {
        return text == null || text.isBlank();
    }

    private static String label(Task task) {
        return task.court() + " / " + task.district() + " / court " + task.courtNo();
    }

    private Pending take(String sessionId) {
        expireOld();
        return pending.remove(sessionId);
    }

    private void expireOld() {
        Instant limit = Instant.now().minus(sessionTtl);
        pending.values().removeIf(p -> p.created.isBefore(limit));
    }

    private CauseListRelayStep expired() {
        return new CauseListRelayStep("EXPIRED", null, null, null, null, null, 0, 0, 0, 0,
                "This session expired, start again", List.of());
    }
}
