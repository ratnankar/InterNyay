package com.internyay.service;

import com.internyay.dto.CauseListRunDto;
import com.internyay.dto.CauseListScheduleDto;
import com.internyay.entity.CauseListRunLog;
import com.internyay.entity.CauseListRunLog.Origin;
import com.internyay.entity.CauseListRunLog.Status;
import com.internyay.scraper.CaptchaSolverClient;
import com.internyay.service.CauseListRunLogService.Totals;
import com.internyay.service.DistrictCauseListRelayService.UnattendedResult;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import com.internyay.scheduler.SchedulerRegistry;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.TreeSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

// Looks up the cause list numbers of a hearing date without anyone typing a CAPTCHA: the Delhi High Court and Supreme
// Court PDFs, and the district court rooms whose CAPTCHA the solver can read. What cannot be done is left for the
// next run (the scheduler runs every hour in the evening before the hearing) or for an admin in Admin > Cause List.
@Service
@Slf4j
public class CauseListAutoRunService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("h:mm:ss a", Locale.ENGLISH);

    private final CauseListService causeListService;
    private final DistrictCauseListRelayService district;
    private final CauseListRunLogService logs;
    private final CaptchaSolverClient solver;

    private final boolean enabled;
    private final SchedulerRegistry registry;
    private final long maxRunNanos;

    private final AtomicBoolean running = new AtomicBoolean(false);
    private final ExecutorService background = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "cause-list-auto");
        t.setDaemon(true);
        return t;
    });

    public CauseListAutoRunService(
            CauseListService causeListService,
            DistrictCauseListRelayService district,
            CauseListRunLogService logs,
            CaptchaSolverClient solver,
            SchedulerRegistry registry,
            @Value("${causelist.auto.enabled:true}") boolean enabled,
            @Value("${causelist.auto.max-minutes:50}") int maxMinutes) {
        this.causeListService = causeListService;
        this.district = district;
        this.logs = logs;
        this.solver = solver;
        this.enabled = enabled;
        this.registry = registry;
        // A run must end before the next hourly one starts
        this.maxRunNanos = Math.max(5, Math.min(maxMinutes, 55)) * 60L * 1_000_000_000L;
    }

    public boolean enabled() {
        return enabled;
    }

    // A scheduled run for one hearing date (the date choice is made in Admin > Schedulers)
    public void runForDate(LocalDate date, String label) {
        if (!enabled) return;
        runBlocking(date, Origin.AUTO, label);
    }

    // Runs now and waits for it to finish (used by the scheduler thread)
    public CauseListRunDto runBlocking(LocalDate date, Origin origin, String label) {
        if (!running.compareAndSet(false, true)) {
            log.warn("Cause-list auto run '{}' for {} skipped: another run is still going", label, date);
            return null;
        }

        CauseListRunLog row = logs.begin(date, origin, label);
        return execute(row.getId(), date, label);
    }

    // Starts a run in the background for the "Run now" button; empty when a run is already going
    public CauseListRunDto startInBackground(LocalDate date, String label) {
        if (!running.compareAndSet(false, true)) return null;

        CauseListRunLog row = logs.begin(date, Origin.AUTO, label);
        background.submit(() -> execute(row.getId(), date, label));
        return CauseListRunDto.of(row);
    }

    private CauseListRunDto execute(Long id, LocalDate date, String label) {
        List<String> lines = new ArrayList<>();
        long started = System.nanoTime();
        String tag = "[cause-list-auto #" + id + "]";

        int hcChecked = 0, hcSaved = 0, hcMissing = 0;
        boolean broke = false;
        UnattendedResult dist = UnattendedResult.EMPTY;

        try {
            log.info("{} {} for hearing date {} started", tag, label, date);
            lines.add(stamp("Started " + label + " for hearing date " + date));

            if (!solver.available()) {
                lines.add(stamp("CAPTCHA solver is not available, district court rooms will be left for the next run"));
            }

            try {
                CauseListService.Result r = causeListService.fetchFor(date, true);
                hcChecked = r.casesChecked();
                hcSaved = r.causeListNosSaved();
                hcMissing = Math.max(0, hcChecked - hcSaved);

                lines.add(stamp(hcChecked == 0
                        ? "Delhi High Court / Supreme Court: nothing to look up"
                        : "Delhi High Court / Supreme Court: " + hcChecked + " case(s) looked up, " + hcSaved
                                + " number(s) saved" + (hcMissing > 0 ? ", " + hcMissing + " not in a published list yet" : "")));
                log.info("{} High Court / Supreme Court: {} looked up, {} saved", tag, hcChecked, hcSaved);

            } catch (Exception e) {
                broke = true;
                lines.add(stamp("Delhi High Court / Supreme Court lookup failed: " + e.getMessage()));
                log.error("{} High Court / Supreme Court lookup failed", tag, e);
            }

            long districtDeadline = started + maxRunNanos;

            try {
                dist = district.runUnattended(date, districtDeadline, line -> lines.add(stamp(line)));
                lines.add(stamp("District courts: " + dist.rooms() + " court room(s) to look up, " + dist.done()
                        + " done, " + dist.needCaptcha() + " need a CAPTCHA typed, " + dist.failed() + " failed, "
                        + dist.saved() + " number(s) saved"));
                log.info("{} district courts: rooms={} done={} captcha={} failed={} saved={}", tag, dist.rooms(), dist.done(),
                        dist.needCaptcha(), dist.failed(), dist.saved());

            } catch (Exception e) {
                broke = true;
                lines.add(stamp("District court lookup failed: " + e.getMessage()));
                log.error("{} district court lookup failed", tag, e);
            }

            int saved = hcSaved + dist.saved();
            boolean leftovers = hcMissing > 0 || dist.needCaptcha() > 0 || dist.failed() > 0;
            boolean nothing = hcChecked == 0 && dist.rooms() == 0 && !broke;

            Status status = nothing ? Status.NOTHING_TO_DO
                    : broke && saved == 0 ? Status.FAILED
                    : broke || leftovers ? Status.PARTIAL
                    : Status.SUCCESS;

            String summary = summarise(status, saved, hcMissing, dist);
            lines.add(stamp(summary));

            logs.finish(id, status, new Totals(hcChecked, dist.rooms(), dist.done(), dist.needCaptcha(), dist.failed(), saved),
                    summary, lines);
            log.info("{} finished: {}", tag, summary);

        } catch (RuntimeException e) {
            log.error("{} run failed", tag, e);
            lines.add(stamp("Run failed: " + e.getMessage()));
            logs.finish(id, Status.FAILED, new Totals(hcChecked, dist.rooms(), dist.done(), dist.needCaptcha(), dist.failed(),
                    hcSaved + dist.saved()), "Run failed: " + e.getMessage(), lines);

        } finally {
            running.set(false);
        }

        return logs.get(id).orElse(null);
    }

    private static String summarise(Status status, int saved, int hcMissing, UnattendedResult dist) {
        if (status == Status.NOTHING_TO_DO) return "Nothing to look up: every case on this date already has its number, or none is listed";

        List<String> parts = new ArrayList<>();
        parts.add(saved + " number(s) saved");
        if (dist.needCaptcha() > 0) parts.add(dist.needCaptcha() + " court room(s) need a CAPTCHA typed in Admin > Cause List");
        if (dist.failed() > 0) parts.add(dist.failed() + " court room(s) failed");
        if (hcMissing > 0) parts.add(hcMissing + " High Court / Supreme Court case(s) not in a published list yet");
        return String.join("; ", parts);
    }

    private static String stamp(String text) {
        return ZonedDateTime.now(IST).format(CLOCK).toLowerCase(Locale.ENGLISH) + "  " + text;
    }

    // Scheduler card: when the next run is, for which date, and how the last one went
    public CauseListScheduleDto schedule() {
        ZonedDateTime now = ZonedDateTime.now(IST);
        ZonedDateTime next = null;
        LocalDate nextFor = null;

        // The times are the ones saved in Admin > Schedulers (null when that job is switched off)
        String cron = registry.cronOf("causelist_evening");
        ZonedDateTime evening = cron == null ? null : nextOf(cron, now);

        if (enabled && evening != null) {
            next = evening;
            // The first hearing date the next run looks up (the date choice is set in Admin > Schedulers)
            List<LocalDate> dates = SchedulerRegistry.datesFor(registry.targetOf("causelist_evening"), evening.toLocalDate());
            nextFor = dates.isEmpty() ? evening.toLocalDate().plusDays(1) : dates.get(0);
        }

        return new CauseListScheduleDto(enabled, cron == null ? List.of() : hoursOf(cron), solver.available(), running.get(),
                next == null ? null : next.toOffsetDateTime(), nextFor, logs.lastFinished().orElse(null));
    }

    private static ZonedDateTime nextOf(String expression, ZonedDateTime from) {
        try {
            return CronExpression.parse(expression).next(from);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    // The clock hours the cron fires at in a day
    static List<Integer> hoursOf(String expression) {
        TreeSet<Integer> hours = new TreeSet<>();

        try {
            CronExpression parsed = CronExpression.parse(expression);
            ZonedDateTime cursor = ZonedDateTime.now(IST).with(LocalTime.MIDNIGHT).minusSeconds(1);
            LocalDate day = cursor.toLocalDate().plusDays(1);

            for (int i = 0; i < 48; i++) {
                cursor = parsed.next(cursor);
                if (cursor == null || !cursor.toLocalDate().equals(day)) break;
                hours.add(cursor.getHour());
            }
        } catch (IllegalArgumentException e) {
            return List.of();
        }
        return new ArrayList<>(hours);
    }

    @PreDestroy
    void shutdown() {
        background.shutdownNow();
    }
}
