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
    public record RefreshResult(Long caseId,
                                LocalDate nextHearing,
                                String status,
                                LocalDate decisionDate,
                                String message) {}

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

    public Result runForYesterday() {
        return runBlocking(LocalDate.now(IST).minusDays(1));
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
                if (moved) updated++;

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

        Optional<ScrapingService.CaseOutlook> outlookOpt = scraping.lookUpOutlook(c.getCnrNo());
        if (outlookOpt.isEmpty()) {
            return new RefreshResult(caseId, c.getNextHearing(), c.getStatus(), c.getDecisionDate(),
                    "Could not read the case page on eCourts, please try again later");
        }
        ScrapingService.CaseOutlook outlook = outlookOpt.get();

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

        return new RefreshResult(caseId, c.getNextHearing(), c.getStatus(), c.getDecisionDate(),
                "No new hearing date on eCourts yet");
    }

    // ===== v2: tiny transactional helpers so a concurrent change is never lost =====
    private void markDecidedInTx(Long caseId, LocalDate decisionDate) {
        tx.executeWithoutResult(status -> {
            Case fresh = caseRepo.findById(caseId).orElse(null);
            if (fresh == null) return;
            if (CaseStatuses.isClosed(fresh.getStatus())) return;
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