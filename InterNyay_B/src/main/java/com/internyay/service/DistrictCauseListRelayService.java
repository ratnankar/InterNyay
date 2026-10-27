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
import com.internyay.scraper.DistrictPortalClient.Option;
import com.internyay.scraper.DistrictPortalClient.PortalSession;
import com.internyay.scraper.DistrictPortalClient.Selection;
import com.internyay.scraper.JudgeNameMatch;
import com.internyay.scraper.DistrictPortalClient.SubmitResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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
        private final int total;
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
        private final Instant created = Instant.now();

        private Pending(Run run, Task task, PortalSession session, Selection selection) {
            this.run = run;
            this.task = task;
            this.session = session;
            this.selection = selection;
        }
    }

    private final CaseRepository caseRepo;
    private final HearingRepository hearingRepo;
    private final CourtService courtService;
    private final JudgeService judgeService;
    private final DistrictPortalClient portal;
    private final CaptchaSolverClient solver;
    private final CauseListRunLogService runLog;
    private final long autoBudgetNanos;
    private final String stateCode;
    private final Duration sessionTtl;

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
            CaptchaSolverClient solver,
            CauseListRunLogService runLog,
            @Value("${causelist.district.auto-budget-seconds:20}") int autoBudgetSeconds,
            @Value("${causelist.district.state-code:26}") String stateCode,
            @Value("${causelist.district.session-ttl-minutes:10}") int ttlMinutes) {
        this.caseRepo = caseRepo;
        this.hearingRepo = hearingRepo;
        this.courtService = courtService;
        this.judgeService = judgeService;
        this.portal = portal;
        this.solver = solver;
        this.runLog = runLog;
        this.autoBudgetNanos = Math.max(5, autoBudgetSeconds) * 1_000_000_000L;
        this.stateCode = stateCode;
        this.sessionTtl = Duration.ofMinutes(Math.max(1, ttlMinutes));
    }

    public synchronized CauseListRelayStep start(java.time.LocalDate date) {
        pending.clear();
        List<String> unusable = new ArrayList<>();
        List<Task> tasks = buildTasks(date, unusable);

        // A run that was left open is closed before the new one starts
        if (currentLogId != null) {
            runLog.finish(currentLogId, CauseListRunLog.Status.ABANDONED, manualTotals(),
                    "Replaced by a new run before it finished", currentLines);
        }

        current = new Run(date, tasks);
        currentLines.clear();
        currentSkipped = 0;
        currentLogId = runLog.begin(date, CauseListRunLog.Origin.MANUAL, "Admin relay").getId();
        currentLines.add("Started for " + date + ": " + tasks.size() + " court room(s) to look up");

        String note = tasks.isEmpty()
                ? "Nothing to fetch: every district court case listed on this date already has its cause list number"
                : "";
        return next(unusable, note);
    }

    public synchronized CauseListRelayStep answer(String sessionId, String captcha) {
        Pending held = take(sessionId);

        if (held == null) {
            return expired();
        }

        SubmitResult result;

        try {
            result = portal.submit(held.session, held.selection, held.run.date, captcha);
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
            String reason = result.message().isBlank() ? "no cause list returned" : result.message();
            return next(new ArrayList<>(List.of(label(held.task) + ": " + reason)), "");
        }

        return next(new ArrayList<>(), save(held, result.html()));
    }

    // The page asks for this after a WORKING step: the automatic reading goes on with the next court rooms
    public synchronized CauseListRelayStep resume() {
        return next(new ArrayList<>(), "");
    }

    public synchronized CauseListRelayStep skip(String sessionId) {
        Pending held = take(sessionId);

        if (held == null) {
            return expired();
        }
        return next(new ArrayList<>(List.of(label(held.task) + ": skipped")), "");
    }

    public synchronized CauseListRelayStep refresh(String sessionId) {
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
                Pending held = prepare(run, task);

                if (solver.available()) {
                    Auto auto = readAutomatically(held);

                    if (auto != null) {
                        if (auto.error() != null) {
                            skipped.add(label(task) + ": " + auto.error());
                        } else if (auto.result().html() == null) {
                            String why = auto.result().message() == null || auto.result().message().isBlank()
                                    ? "no cause list returned" : auto.result().message();
                            skipped.add(label(task) + ": " + why);
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

        String summary = run.saved + " number(s) saved in " + run.total + " court room(s)"
                + (currentSkipped > 0 ? "; " + currentSkipped + " skipped or failed" : "");
        currentLines.add(summary);
        runLog.finish(currentLogId, currentSkipped > 0 ? CauseListRunLog.Status.PARTIAL : CauseListRunLog.Status.SUCCESS,
                manualTotals(), summary, currentLines);
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
        for (int attempt = 1; attempt <= solver.maxAttempts(); attempt++) {
            byte[] image;

            try {
                image = portal.captcha(held.session);
            } catch (IOException | RuntimeException e) {
                log.warn("District cause list {}: CAPTCHA image could not be loaded: {}", label(held.task), e.getMessage());
                return null;
            }

            Optional<String> text = solver.solve(image);

            if (text.isEmpty()) {
                if (!solver.available()) break;
                continue;
            }

            SubmitResult result;

            try {
                result = portal.submit(held.session, held.selection, held.run.date, text.get());
            } catch (IOException | RuntimeException e) {
                log.error("District cause list submit failed: {}", e.getMessage());
                return new Auto(null, e.getMessage());
            }

            if (!result.captchaRejected()) {
                log.info("District cause list {}: CAPTCHA read automatically on attempt {}", label(held.task), attempt);
                return new Auto(result, null);
            }
        }

        log.info("District cause list {}: CAPTCHA not read automatically, asking the admin", label(held.task));
        return null;
    }

    // Looks up a date's district cause lists with no admin present. Court rooms whose CAPTCHA the solver cannot read are
    // counted and left alone (an admin finishes them in Admin > Cause List, or the next hourly run tries again).
    // Does not touch the run an admin may have open on the page. Stops at the deadline so runs never overlap.
    public UnattendedResult runUnattended(java.time.LocalDate date, long deadlineNanos, Consumer<String> note) {
        List<String> unusable = new ArrayList<>();
        List<Task> tasks = buildTasks(date, unusable);
        unusable.forEach(note);

        if (tasks.isEmpty()) return new UnattendedResult(0, 0, 0, unusable.size(), 0);

        if (!solver.available()) {
            note.accept("CAPTCHA solver unavailable: " + tasks.size() + " court room(s) left for an admin or the next run");
            return new UnattendedResult(tasks.size(), 0, tasks.size(), unusable.size(), 0);
        }

        Run run = new Run(date, List.of());
        int done = 0, needCaptcha = 0, failed = unusable.size(), index = 0;

        for (Task task : tasks) {
            index++;

            if (System.nanoTime() > deadlineNanos) {
                int left = tasks.size() - index + 1;
                note.accept("Time limit reached, " + left + " court room(s) left for the next run");
                needCaptcha += left;
                break;
            }

            try {
                Pending held = prepare(run, task);
                Auto auto = readAutomatically(held);

                if (auto == null) {
                    needCaptcha++;
                    note.accept(label(task) + ": CAPTCHA could not be read, needs an admin");
                } else if (auto.error() != null) {
                    failed++;
                    note.accept(label(task) + ": " + auto.error());
                } else if (auto.result().html() == null) {
                    failed++;
                    String why = auto.result().message() == null || auto.result().message().isBlank()
                            ? "no cause list returned" : auto.result().message();
                    note.accept(label(task) + ": " + why);
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

            } catch (IOException | RuntimeException e) {
                failed++;
                log.warn("Unattended district cause list task {} failed: {}", label(task), e.getMessage());
                note.accept(label(task) + ": " + e.getMessage());
            }
        }

        return new UnattendedResult(tasks.size(), done, needCaptcha, failed, run.saved);
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

            List<Option> tied = judgeName == null ? List.of() : JudgeNameMatch.topTied(courts, Option::text, judgeName);

            // A judge can hold two courts (a regular one and an evening court): prefer the regular one
            if (tied.size() > 1) {
                List<Option> regular = tied.stream().filter(o -> !o.text().toLowerCase().contains("evening")).toList();

                if (regular.size() == 1) {
                    tied = regular;
                }
            }

            Option court = tied.size() == 1 ? tied.get(0) : null;

            if (tied.size() > 1) {
                ambiguous = tied.stream().map(Option::text).collect(java.util.stream.Collectors.joining(" | "));
            }

            if (court == null) {
                List<Option> mentioned = courts.stream()
                        .filter(o -> CourtNoToken.mentions(o.text(), task.courtNo()))
                        .toList();

                if (mentioned.size() == 1) {
                    court = mentioned.get(0);
                }
            }

            // Family courts are listed by their own room code ("FC-46") and carry no judge name in the portal's list, so
            // the code itself is looked for. Only a code with letters in it: a bare number would fit too many courts
            if (court == null && task.courtNo() != null && task.courtNo().matches("(?i).*[a-z].*\\d.*")) {
                String code = squash(task.courtNo());
                List<Option> byRoomCode = courts.stream().filter(o -> squash(o.text()).contains(code)).toList();

                if (byRoomCode.size() == 1) {
                    court = byRoomCode.get(0);
                }
            }

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

        String sample = offeredCourts.stream().limit(12).collect(java.util.stream.Collectors.joining("; "));
        log.warn("Court no. '{}' not matched among {} portal court(s) of {} / {}: {}", task.courtNo(),
                offeredCourts.size(), task.court(), task.district(), sample);
        throw new IOException(judgeName == null
                ? "no judge is listed in Quick Access for court no. '" + task.courtNo()
                        + "', so it cannot be matched to the portal's court list"
                : "judge '" + judgeName + "' (court no. '" + task.courtNo() + "') not found in the portal's court list ("
                        + offeredCourts.size() + " courts); "
                        + (ambiguous != null ? "several portal courts fit, none could be chosen: " + ambiguous
                                : closest(allCourts, judgeName)));
    }

    private CauseListRelayStep captchaStep(String id, Pending held, String message) {
        return captchaStep(id, held, message, List.of());
    }

    private CauseListRelayStep captchaStep(String id, Pending held, String message, List<String> skipped) {
        String image;

        try {
            image = "data:image/png;base64," + Base64.getEncoder().encodeToString(portal.captcha(held.session));
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
                CaseKey.parse(c.getCaseNo()).ifPresent(k -> log.warn("Case {} not in the list; entries with number {}: {}",
                        c.getCaseNo(), k.number(), serials.keySet().stream().filter(o -> o.number() == k.number()).toList()));
            }
        }

        if (idsBySerial.isEmpty()) {
            log.warn("Cause list for {} had {} serial(s) but none matched the {} case(s) asked for; list sample {}, case sample {}",
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
    private List<Task> buildTasks(java.time.LocalDate date, List<String> unusable) {
        Predicate<Case> juvenile = courtService.juvenileBoardCases();
        Map<String, List<Case>> groups = new LinkedHashMap<>();
        java.util.Set<Long> seen = new java.util.HashSet<>();

        for (Case c : caseRepo.findByNextHearing(date)) {
            // Already has its cause list number for this date (for example saved earlier), no need to ask the portal again
            boolean numbered = c.getCauseListNo() != null && date.equals(c.getListingDate());
            addCandidate(c, numbered, juvenile, seen, groups, unusable);
        }

        for (Hearing h : hearingRepo.findAllWithCaseByDate(date)) {
            addCandidate(h.getLegalCase(), h.getCauseListNo() != null, juvenile, seen, groups, unusable);
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
