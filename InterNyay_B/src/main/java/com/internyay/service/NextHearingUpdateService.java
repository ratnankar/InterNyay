package com.internyay.service;

import com.internyay.entity.Case;                                    // ===== NEW =====
import com.internyay.repository.CaseRepository;
import com.internyay.repository.CaseRepository.HearingDateDue;
import com.internyay.util.CaseStatuses;                             // ===== NEW =====
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

// Moves cases on to their next hearing date once the court has put it on eCourts. A case is "due" when its next
// hearing date is the hearing date being worked on and nobody has moved it on yet. For each one the eCourts portal's
// case page is read (ScrapingService.lookUpOutlook) and, when it shows a later date, the case is moved to it.
//
// The court usually puts the new date up some time after the hearing, so the scheduler (NextHearingUpdateScheduler)
// runs this again and again from 5 PM to 12 AM. Every run only looks at the cases that still have the old date, so
// a case that is moved in one run is not asked about again, and one that could not be read is simply tried next time
@Service
@Slf4j
public class NextHearingUpdateService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    // How a run went for one hearing date
    //  due          - open cases that still had the date as their next hearing when the run started
    //  updated      - cases moved to a new date
    //  stillPending - eCourts has no later date yet, tried again next run
    //  unreadable   - the portal or CAPTCHA reader failed for the case, tried again next run
    //  disposed     - eCourts says the case is disposed: no new date to expect, left alone and not asked again today
    //  skipped      - cases left for the next run because the run ran out of time
    public record Result(LocalDate date, int due, int updated, int stillPending, int unreadable, int disposed, int skipped) {
        public static Result none(LocalDate date) { return new Result(date, 0, 0, 0, 0, 0, 0); }

        public String summary() {
            if (due == 0) return "Nothing to update for " + date + ": every case has moved on or has no CNR number";
            return updated + " of " + due + " case(s) moved to a new hearing date"
                    + (stillPending > 0 ? ", " + stillPending + " not on eCourts yet" : "")
                    + (unreadable > 0 ? ", " + unreadable + " could not be read" : "")
                    + (disposed > 0 ? ", " + disposed + " disposed" : "")
                    + (skipped > 0 ? ", " + skipped + " left for the next run" : "");
        }

        // Cases the next run still has to try
        public int toRetry() { return stillPending + unreadable + skipped; }
    }

    // ===== NEW: what the manual "Refresh" button gets back =====
    // The case's state after the attempt (so the screen can update the next-hearing label and, if the case
    // became Decided, notice the status change), plus a short sentence for the toast
    public record RefreshResult(Long caseId,
                                LocalDate nextHearing,
                                String status,
                                LocalDate decisionDate,
                                String message) {}

    private final CaseRepository caseRepo;
    private final ScrapingService scraping;
    private final HearingService hearingService;

    private final boolean enabled;
    private final long delayMs;
    private final long maxRunNanos;

    private final AtomicBoolean running = new AtomicBoolean(false);

    // Cases eCourts calls disposed, per hearing date: no new date is coming, so later runs of that day skip them
    private final Map<LocalDate, Set<Long>> disposedToday = new ConcurrentHashMap<>();

    public NextHearingUpdateService(
            CaseRepository caseRepo,
            ScrapingService scraping,
            HearingService hearingService,
            @Value("${nexthearing.update.enabled:true}") boolean enabled,
            @Value("${nexthearing.update.delay-ms:1500}") long delayMs,
            @Value("${nexthearing.update.max-minutes:50}") int maxMinutes) {
        this.caseRepo = caseRepo;
        this.scraping = scraping;
        this.hearingService = hearingService;
        this.enabled = enabled;
        this.delayMs = Math.max(0, delayMs);
        // A run must end before the next hourly one starts
        this.maxRunNanos = Math.max(5, Math.min(maxMinutes, 55)) * 60L * 1_000_000_000L;
    }

    public boolean enabled() {
        return enabled;
    }

    // The evening runs (5 PM to 11 PM): the hearing day is today
    public Result runForToday() {
        return runBlocking(LocalDate.now(IST));
    }

    // The 12 AM run: the hearing day has just ended, this is the last chance to catch its new dates
    public Result runForYesterday() {
        return runBlocking(LocalDate.now(IST).minusDays(1));
    }

    // Runs now and waits for it to finish. Empty result when switched off or another run is still going
    public Result runBlocking(LocalDate date) {
        if (!enabled) return Result.none(date);

        if (!running.compareAndSet(false, true)) {
            log.warn("[next-hearing] run for {} skipped: another run is still going", date);
            return Result.none(date);
        }

        try {
            return execute(date);
        } catch (RuntimeException e) {
            log.error("[next-hearing] run for {} failed", date, e);
            return Result.none(date);
        } finally {
            running.set(false);
        }
    }

    private Result execute(LocalDate date) {
        // Only today's skip list is worth keeping
        disposedToday.keySet().removeIf(d -> d.isBefore(date));
        Set<Long> settled = disposedToday.computeIfAbsent(date, d -> ConcurrentHashMap.newKeySet());

        List<HearingDateDue> due = caseRepo.findOpenWithCnrListedOn(date).stream()
                .filter(c -> !settled.contains(c.getId()))
                .toList();

        if (due.isEmpty()) {
            log.info("[next-hearing] {}: nothing to update", date);
            return Result.none(date);
        }

        if (!scraping.available()) {
            log.info("[next-hearing] {}: {} case(s) due, the automatic CAPTCHA reader is not available, left for the next run",
                    date, due.size());
            return new Result(date, due.size(), 0, 0, due.size(), 0, 0);
        }

        long deadline = System.nanoTime() + maxRunNanos;
        int updated = 0, pending = 0, unreadable = 0, disposed = 0, skipped = 0;
        Set<Long> handled = new HashSet<>();

        log.info("[next-hearing] {}: {} case(s) still on this date", date, due.size());

        for (HearingDateDue c : due) {
            if (System.nanoTime() > deadline) {
                skipped = due.size() - handled.size();
                log.warn("[next-hearing] {}: out of time, {} case(s) left for the next run", date, skipped);
                break;
            }
            handled.add(c.getId());

            Optional<ScrapingService.CaseOutlook> outlook = scraping.lookUpOutlook(c.getCnrNo());

            if (outlook.isEmpty()) {
                unreadable++;

            } else if (outlook.get().disposed()) {
                // ===== MODIFIED: mark the disposed case as Decided and clear its next hearing =====
                settled.add(c.getId());
                disposed++;
                caseRepo.findById(c.getId()).ifPresent(caseEntity -> {
                    caseEntity.setStatus(CaseStatuses.DECIDED);
                    if (caseEntity.getDecisionDate() == null) caseEntity.setDecisionDate(date);
                    caseEntity.setNextHearing(null);
                    caseEntity.setCauseListNo(null);
                    caseEntity.setListingDate(null);
                    caseRepo.save(caseEntity);
                });

            } else if (outlook.get().nextHearing() != null && outlook.get().nextHearing().isAfter(date)) {
                boolean moved;
                try {
                    moved = hearingService.applyEcourtsNextHearing(c.getId(), date, outlook.get().nextHearing());
                } catch (RuntimeException e) {
                    log.warn("[next-hearing] case {}: could not move to {}: {}", c.getId(), outlook.get().nextHearing(), e.getMessage());
                    unreadable++;
                    pause();
                    continue;
                }
                // False: the case moved on by itself meanwhile, nothing left to do for it
                if (moved) updated++;

            } else {
                // eCourts still shows this date (or an earlier one): the court has not put the new date up yet
                pending++;
            }

            pause();
        }

        Result result = new Result(date, due.size(), updated, pending, unreadable, disposed, skipped);
        log.info("[next-hearing] {}: {}", date, result.summary());
        return result;
    }

    // ===== NEW: on-demand refresh used by the manual "Refresh" button on the case page =====
    // Same eCourts lookup as the scheduled run, but for a single case and for the user's own case only.
    // Disposed cases get their status changed to Decided. Otherwise a later date on eCourts is applied
    // through HearingService.applyEcourtsNextHearing (the date currently on the case is treated as "heard")
    public RefreshResult refreshSingleCase(Long caseId, Long userId) {
        Case c = caseRepo.findById(caseId).orElse(null);
        if (c == null || c.getUser() == null || !c.getUser().getId().equals(userId)) {
            throw new IllegalArgumentException("Case not found");
        }

        LocalDate today = LocalDate.now(IST);

        if (c.getCnrNo() == null || c.getCnrNo().isBlank()) {
            return new RefreshResult(caseId, c.getNextHearing(), c.getStatus(), c.getDecisionDate(),
                    "The case has no CNR number, so eCourts cannot be checked");
        }

        if (!scraping.available()) {
            return new RefreshResult(caseId, c.getNextHearing(), c.getStatus(), c.getDecisionDate(),
                    "The automatic CAPTCHA reader is not available right now, please try again later");
        }

        Optional<ScrapingService.CaseOutlook> outlookOpt = scraping.lookUpOutlook(c.getCnrNo());
        if (outlookOpt.isEmpty()) {
            return new RefreshResult(caseId, c.getNextHearing(), c.getStatus(), c.getDecisionDate(),
                    "Could not read the case page on eCourts, please try again later");
        }

        ScrapingService.CaseOutlook outlook = outlookOpt.get();

        if (outlook.disposed()) {
            if (!CaseStatuses.isClosed(c.getStatus())) {
                c.setStatus(CaseStatuses.DECIDED);
                if (c.getDecisionDate() == null) c.setDecisionDate(today);
                c.setNextHearing(null);
                c.setCauseListNo(null);
                c.setListingDate(null);
                caseRepo.save(c);
                return new RefreshResult(caseId, null, c.getStatus(), c.getDecisionDate(),
                        "eCourts shows the case as disposed — marked as Decided");
            }
            return new RefreshResult(caseId, c.getNextHearing(), c.getStatus(), c.getDecisionDate(),
                    "eCourts shows the case as disposed (already marked " + c.getStatus() + ")");
        }

        LocalDate currentNext = c.getNextHearing();
        if (outlook.nextHearing() != null
                && currentNext != null
                && outlook.nextHearing().isAfter(currentNext)) {
            boolean moved = hearingService.applyEcourtsNextHearing(caseId, currentNext, outlook.nextHearing());
            Case refreshed = caseRepo.findById(caseId).orElse(c);
            return new RefreshResult(caseId, refreshed.getNextHearing(), refreshed.getStatus(),
                    refreshed.getDecisionDate(),
                    moved
                        ? "Moved to the next hearing date on eCourts: " + outlook.nextHearing()
                        : "The case moved on meanwhile; the latest date is shown");
        }

        if (outlook.nextHearing() != null && outlook.nextHearing().equals(currentNext)) {
            return new RefreshResult(caseId, currentNext, c.getStatus(), c.getDecisionDate(),
                    "eCourts shows the same next hearing date");
        }

        return new RefreshResult(caseId, c.getNextHearing(), c.getStatus(), c.getDecisionDate(),
                "No new hearing date on eCourts yet");
    }

    // The portal is not hammered: a short pause between two cases
    private void pause() {
        if (delayMs <= 0) return;
        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}