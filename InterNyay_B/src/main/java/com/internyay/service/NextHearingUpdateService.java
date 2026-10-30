package com.internyay.service;

import com.internyay.entity.Case;                                    // ===== NEW =====
import com.internyay.repository.CaseRepository;
import com.internyay.repository.CaseRepository.HearingDateDue;
import com.internyay.util.CaseStatuses;                             // ===== NEW =====
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate; // ===== v2 =====

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
@Slf4j
public class NextHearingUpdateService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

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

        public int toRetry() { return stillPending + unreadable + skipped; }
    }

    // ===== NEW ===== What the manual "Refresh" button gets back
    // hearingsAdded / ordersFound: what the history sync brought in (past hearing dates the case was missing, and
    // order PDFs downloaded for hearings that had none)
    public record RefreshResult(Long caseId,
                                LocalDate nextHearing,
                                String status,
                                LocalDate decisionDate,
                                String message,
                                int hearingsAdded,
                                int ordersFound) {
        public RefreshResult(Long caseId, LocalDate nextHearing, String status, LocalDate decisionDate, String message) {
            this(caseId, nextHearing, status, decisionDate, message, 0, 0);
        }

        // The same answer, with what the history sync did added to the message
        RefreshResult withHistory(int added, int orders) {
            if (added == 0 && orders == 0) return this;
            StringBuilder extra = new StringBuilder();
            if (added > 0) extra.append(added).append(" missing hearing date").append(added == 1 ? "" : "s").append(" added");
            if (orders > 0) {
                if (extra.length() > 0) extra.append(", ");
                extra.append(orders).append(" order").append(orders == 1 ? "" : "s").append(" downloaded from eCourts");
            }
            return new RefreshResult(caseId, nextHearing, status, decisionDate, message + ". " + extra, added, orders);
        }
    }

    private final CaseRepository caseRepo;
    private final ScrapingService scraping;
    private final HearingService hearingService;
    private final TransactionTemplate tx;   // ===== v2: atomic read-modify-write for the tiny status/date updates =====

    private final boolean enabled;
    private final long delayMs;
    private final long maxRunNanos;

    private final AtomicBoolean running = new AtomicBoolean(false);

    private final Map<LocalDate, Set<Long>> disposedToday = new ConcurrentHashMap<>();

    public NextHearingUpdateService(
            CaseRepository caseRepo,
            ScrapingService scraping,
            HearingService hearingService,
            TransactionTemplate tx,                                     // ===== v2 =====
            @Value("${nexthearing.update.enabled:true}") boolean enabled,
            @Value("${nexthearing.update.delay-ms:1500}") long delayMs,
            @Value("${nexthearing.update.max-minutes:50}") int maxMinutes) {
        this.caseRepo = caseRepo;
        this.scraping = scraping;
        this.hearingService = hearingService;
        this.tx = tx;
        this.enabled = enabled;
        this.delayMs = Math.max(0, delayMs);
        this.maxRunNanos = Math.max(5, Math.min(maxMinutes, 55)) * 60L * 1_000_000_000L;
    }

    public boolean enabled() {
        return enabled;
    }

    public Result runForToday() {
        return runBlocking(LocalDate.now(IST));
    }

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

            // ===== v2: disposed is checked first on purpose =====
            // A disposed case has no next hearing to move to, even if the portal still shows a
            // stale date. So it is marked Decided and the run forgets about it for the day.
            } else if (outlook.get().disposed()) {
                settled.add(c.getId());
                disposed++;
                markDecidedInTx(c.getId(), date);

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
                if (moved) {
                    updated++;
                    // Notes which dates have an order on eCourts (nothing is downloaded: "Get order" does that)
                    try {
                        hearingService.syncEcourtsHistory(c.getId(), outlook.get().history(), c.getUserId());
                    } catch (RuntimeException e) {
                        log.warn("[next-hearing] case {}: order dates could not be noted: {}", c.getId(), e.getMessage());
                    }
                }

            } else {
                pending++;
            }

            pause();
        }

        Result result = new Result(date, due.size(), updated, pending, unreadable, disposed, skipped);
        log.info("[next-hearing] {}: {}", date, result.summary());
        return result;
    }

    // ===== v2: single-case refresh used by the manual "Refresh" button =====
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

        // Order PDFs are never downloaded here: the dates that have an order on eCourts are only noted, and the
        // advocate gets each order with its "Get order" button
        Optional<ScrapingService.CaseOutlook> outlookOpt = scraping.lookUpOutlook(c.getCnrNo());
        if (outlookOpt.isEmpty()) {
            return new RefreshResult(caseId, c.getNextHearing(), c.getStatus(), c.getDecisionDate(),
                    "Could not read the case page on eCourts, please try again later");
        }
        ScrapingService.CaseOutlook outlook = outlookOpt.get();

        // ===== v3: fill in what the case is missing: every past hearing date eCourts lists, and the order of each =====
        // Done first and on its own, so a failure here never blocks the next hearing date logic below
        int added = 0, orders = 0;
        try {
            var synced = hearingService.syncEcourtsHistory(caseId, outlook.history(), userId);
            if (synced != null) added = synced.created();
        } catch (RuntimeException e) {
            log.warn("[refresh] case {}: hearing history could not be synced: {}", caseId, e.getMessage());
        }

        return decideNextHearing(c, outlook, today).withHistory(added, orders);
    }

    // The next hearing date part of the Refresh button (unchanged rules, see the comments inside)
    private RefreshResult decideNextHearing(Case c, ScrapingService.CaseOutlook outlook, LocalDate today) {
        Long caseId = c.getId();

        // ===== v3: a closed case (Decided, Withdrawn...) only gets its history filled in, never a new next hearing =====
        if (CaseStatuses.isClosed(c.getStatus()) && !outlook.disposed()) {
            return new RefreshResult(caseId, c.getNextHearing(), c.getStatus(), c.getDecisionDate(),
                    "The case is " + c.getStatus() + ", its next hearing date was left as it is");
        }

        // ===== v2: disposed is checked first, same rule as execute() =====
        if (outlook.disposed()) {
            if (CaseStatuses.isClosed(c.getStatus())) {
                return new RefreshResult(caseId, c.getNextHearing(), c.getStatus(), c.getDecisionDate(),
                        "eCourts shows the case as disposed (already marked " + c.getStatus() + ")");
            }
            markDecidedInTx(caseId, today);
            Case refreshed = caseRepo.findById(caseId).orElse(c);
            return new RefreshResult(caseId, refreshed.getNextHearing(), refreshed.getStatus(),
                    refreshed.getDecisionDate(),
                    "eCourts shows the case as disposed — marked as Decided");
        }

        LocalDate currentNext = c.getNextHearing();
        LocalDate ecourtsNext  = outlook.nextHearing();

        // ===== v2: adopt a date when the case has none yet =====
        if (ecourtsNext != null && currentNext == null) {
            adoptNextHearingInTx(caseId, ecourtsNext);
            Case refreshed = caseRepo.findById(caseId).orElse(c);
            return new RefreshResult(caseId, refreshed.getNextHearing(), refreshed.getStatus(),
                    refreshed.getDecisionDate(),
                    "Next hearing set from eCourts: " + ecourtsNext);
        }

        // The stored date is still upcoming, so that hearing has not been held: it must not be moved into the
        // history as "heard". The advocate can change it with Update if the court really rescheduled it
        if (ecourtsNext != null && currentNext != null && currentNext.isAfter(today)
                && !ecourtsNext.equals(currentNext)) {
            return new RefreshResult(caseId, currentNext, c.getStatus(), c.getDecisionDate(),
                    "eCourts shows " + ecourtsNext + " but your next hearing " + currentNext
                            + " has not come yet; use Update if the date was changed");
        }

        // A later date on eCourts is moved in, exactly like the scheduled run does
        if (ecourtsNext != null && currentNext != null && ecourtsNext.isAfter(currentNext)) {
            boolean moved = hearingService.applyEcourtsNextHearing(caseId, currentNext, ecourtsNext);
            Case refreshed = caseRepo.findById(caseId).orElse(c);
            return new RefreshResult(caseId, refreshed.getNextHearing(), refreshed.getStatus(),
                    refreshed.getDecisionDate(),
                    moved
                        ? "Moved to the next hearing date on eCourts: " + ecourtsNext
                        : "The case moved on meanwhile; the latest date is shown");
        }

        if (ecourtsNext != null && ecourtsNext.equals(currentNext)) {
            return new RefreshResult(caseId, currentNext, c.getStatus(), c.getDecisionDate(),
                    "eCourts shows the same next hearing date");
        }

        // eCourts shows an earlier date than the stored one (a past date that was already heard)
        if (ecourtsNext != null) {
            return new RefreshResult(caseId, c.getNextHearing(), c.getStatus(), c.getDecisionDate(),
                    "eCourts shows " + ecourtsNext + ", which is not later than the stored date, so nothing was changed");
        }

        return new RefreshResult(caseId, c.getNextHearing(), c.getStatus(), c.getDecisionDate(),
                "No new hearing date on eCourts yet");
    }

    // ===== v2: tiny transactional helpers so a concurrent change is never lost =====
    private void markDecidedInTx(Long caseId, LocalDate decisionDate) {
        tx.executeWithoutResult(status -> {
            Case fresh = caseRepo.findById(caseId).orElse(null);
            if (fresh == null) return;
            if (CaseStatuses.isClosed(fresh.getStatus())) return;
            // The date the case was listed for stays in the hearing history, otherwise it drops off the calendar
            if (fresh.getNextHearing() != null && fresh.getUser() != null) {
                hearingService.recordHeard(fresh, fresh.getNextHearing(), fresh.getUser().getId());
            }
            fresh.setStatus(CaseStatuses.DECIDED);
            if (fresh.getDecisionDate() == null) fresh.setDecisionDate(decisionDate);
            fresh.setNextHearing(null);
            fresh.setCauseListNo(null);
            fresh.setListingDate(null);
            caseRepo.save(fresh);
        });
    }

    private void adoptNextHearingInTx(Long caseId, LocalDate nextHearing) {
        tx.executeWithoutResult(status -> {
            Case fresh = caseRepo.findById(caseId).orElse(null);
            if (fresh == null) return;
            if (fresh.getNextHearing() != null) return;   // someone else set one meanwhile, keep theirs
            fresh.setNextHearing(nextHearing);
            fresh.setCauseListNo(null);
            fresh.setListingDate(null);
            caseRepo.save(fresh);
        });
    }

    private void pause() {
        if (delayMs <= 0) return;
        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}