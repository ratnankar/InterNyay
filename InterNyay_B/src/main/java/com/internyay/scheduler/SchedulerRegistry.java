package com.internyay.scheduler;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import java.util.function.Consumer;

// Runs the background jobs at the times saved in the scheduler_settings table, so the admin can change a time or switch
// a job off without restarting the server. Each scheduler class registers its jobs here (with the default time from
// application.properties, used only until the admin saves one).
@Slf4j
@Component
public class SchedulerRegistry {

    public static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    // The shortest gap allowed between two runs of a job
    private static final long MIN_GAP_SECONDS = 5 * 60;

    private static final String FALLBACK_CRON = "0 0 0 * * *";

    // Who started a run (shown on the Scheduler screen; the frontend compares with BY_RUN_NOW)
    private static final String BY_SCHEDULE = "Schedule";
    private static final String BY_RUN_NOW = "Run now";

    // Which hearing date(s) a job can be pointed at. Resolved on the day the job runs (IST)
    public static final List<String> TARGETS = List.of("TODAY", "TOMORROW", "DAY_AFTER", "TODAY_TOMORROW", "NEXT_3_DAYS", "NEXT_7_DAYS");

    public record Job(String key, String label, String description, String defaultCron, List<String> targets,
                      String defaultTarget, Consumer<List<LocalDate>> task) {}

    public record Setting(String cron, boolean enabled, String target) {}

    public record LastRun(java.time.OffsetDateTime at, boolean ok, String message, String by) {}

    public record JobView(String key, String label, String description, String cron, boolean enabled,
                          String defaultCron, java.time.OffsetDateTime nextRun,
                          List<String> targets, String target, String defaultTarget, List<LocalDate> dates,
                          boolean running, LastRun lastRun) {}

    // The hearing dates a target means, counted from the given day
    public static List<LocalDate> datesFor(String target, LocalDate today) {
        if (target == null) return List.of();
        return switch (target) {
            case "TODAY" -> List.of(today);
            case "TOMORROW" -> List.of(today.plusDays(1));
            case "DAY_AFTER" -> List.of(today.plusDays(2));
            case "TODAY_TOMORROW" -> List.of(today, today.plusDays(1));
            case "NEXT_3_DAYS" -> days(today, 3);
            case "NEXT_7_DAYS" -> days(today, 7);
            default -> List.of();
        };
    }

    private static List<LocalDate> days(LocalDate from, int count) {
        List<LocalDate> out = new ArrayList<>();
        for (int i = 0; i < count; i++) out.add(from.plusDays(i));
        return out;
    }

    private final JdbcTemplate jdbc;
    private final ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
    private final Map<String, Job> jobs = new LinkedHashMap<>();
    private final Map<String, ScheduledFuture<?>> futures = new ConcurrentHashMap<>();
    private final Map<String, LastRun> lastRuns = new ConcurrentHashMap<>();
    private final Set<String> running = ConcurrentHashMap.newKeySet();
    private volatile boolean started;

    public SchedulerRegistry(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        scheduler.setPoolSize(4);
        scheduler.setThreadNamePrefix("job-");
        scheduler.setDaemon(true);
        scheduler.initialize();
    }

    // A job with no date choice. A default of "-" starts the job switched off (the old property convention)
    public synchronized void register(String key, String label, String description, String defaultCron, Runnable task) {
        register(key, label, description, defaultCron, List.of(), null, dates -> task.run());
    }

    // A job that looks up hearing dates: the admin picks which ones (today, tomorrow ...) and the task gets them
    public synchronized void register(String key, String label, String description, String defaultCron,
                                      String defaultTarget, Consumer<List<LocalDate>> task) {
        register(key, label, description, defaultCron, TARGETS, defaultTarget, task);
    }

    private synchronized void register(String key, String label, String description, String defaultCron,
                                       List<String> targets, String defaultTarget, Consumer<List<LocalDate>> task) {
        jobs.put(key, new Job(key, label, description, defaultCron, targets, defaultTarget, task));
        if (started) apply(key);
    }

    @EventListener(ApplicationReadyEvent.class)
    public synchronized void start() {
        started = true;
        for (String key : new ArrayList<>(jobs.keySet())) apply(key);
    }

    // The saved time of a job, or null when the job is switched off (used by pages that show the next run)
    public String cronOf(String key) {
        Setting s = setting(key);
        return s == null || !s.enabled() ? null : s.cron();
    }

    // The saved date choice of a job (null when it has none)
    public String targetOf(String key) {
        Setting s = setting(key);
        return s == null ? null : s.target();
    }

    public List<JobView> list() {
        ZonedDateTime now = ZonedDateTime.now(IST);
        List<Job> snapshot;
        synchronized (this) { snapshot = new ArrayList<>(jobs.values()); }
        List<JobView> out = new ArrayList<>();
        for (Job j : snapshot) out.add(view(j, now));
        return out;
    }

    private JobView view(Job j, ZonedDateTime now) {
        Setting s = setting(j.key());
        return new JobView(j.key(), j.label(), j.description(), s.cron(), s.enabled(), cleanDefault(j.defaultCron()),
                s.enabled() ? offset(next(s.cron(), now)) : null,
                j.targets(), s.target(), j.defaultTarget(), datesFor(s.target(), now.toLocalDate()),
                running.contains(j.key()), lastRuns.get(j.key()));
    }

    // Saves a new time / on-off state / date choice and applies it straight away. Throws IllegalArgumentException with a
    // message the admin can read when something is not acceptable
    public synchronized JobView update(String key, String cron, boolean enabled, String target) {
        Job job = jobs.get(key);
        if (job == null) throw new java.util.NoSuchElementException("Unknown job");

        String clean = cron == null ? "" : cron.trim().replaceAll("\\s+", " ");
        validate(clean);
        String chosen = checkTarget(job, target, setting(key).target());

        saveSetting(key, clean, enabled, chosen);
        apply(key);
        log.info("[schedulers] {} set to '{}' ({}){}", key, clean, enabled ? "on" : "off", chosen == null ? "" : " for " + chosen);
        return view(job, ZonedDateTime.now(IST));
    }

    // Runs a job right now in the background, for the date choice given (or the saved one)
    public void runNow(String key, String target) {
        Job job = jobs.get(key);
        if (job == null) throw new java.util.NoSuchElementException("Unknown job");

        String chosen = checkTarget(job, target, setting(key).target());
        if (running.contains(key)) throw new IllegalArgumentException("This job is already running");

        scheduler.execute(() -> runJob(job, chosen, BY_RUN_NOW));
    }

    // A blank choice keeps the fallback; a job without date choices has none
    private static String checkTarget(Job job, String target, String fallback) {
        if (job.targets().isEmpty()) return null;
        if (target == null || target.isBlank()) return fallback != null ? fallback : job.defaultTarget();
        if (!job.targets().contains(target)) throw new IllegalArgumentException("That date choice is not valid");
        return target;
    }

    // Spring cron with seconds: "second minute hour day month weekday". Runs must be at least 5 minutes apart
    public static void validate(String cron) {
        String[] parts = cron.split(" ");
        if (parts.length != 6 || !CronExpression.isValidExpression(cron)) {
            throw new IllegalArgumentException("That time is not valid");
        }
        if (!parts[0].equals("0")) {
            throw new IllegalArgumentException("Jobs can only start at the beginning of a minute");
        }
        CronExpression parsed = CronExpression.parse(cron);
        ZonedDateTime t = parsed.next(ZonedDateTime.now(IST));
        for (int i = 0; i < 60 && t != null; i++) {
            ZonedDateTime n = parsed.next(t);
            if (n == null) break;
            if (java.time.Duration.between(t, n).getSeconds() < MIN_GAP_SECONDS) {
                throw new IllegalArgumentException("Runs must be at least 5 minutes apart");
            }
            t = n;
        }
        if (t == null) throw new IllegalArgumentException("That time never comes");
    }

    // ---- internals ------------------------------------------------------------------------------------------------

    private void apply(String key) {
        ScheduledFuture<?> old = futures.remove(key);
        if (old != null) old.cancel(false);

        Job job = jobs.get(key);
        Setting s = setting(key);
        if (job == null || s == null || !s.enabled()) return;

        try {
            futures.put(key, scheduler.schedule(() -> runJob(job, null, BY_SCHEDULE), new CronTrigger(s.cron(), IST)));
        } catch (RuntimeException e) {
            log.error("[schedulers] {} could not be scheduled with '{}': {}", key, s.cron(), e.getMessage());
        }
    }

    // One run of a job (scheduled or "Run now"); the dates come from the saved date choice unless one is given
    private void runJob(Job job, String targetOverride, String by) {
        String key = job.key();
        if (!running.add(key)) {
            log.warn("[schedulers] {} skipped: the previous run is still going", key);
            return;
        }
        try {
            Setting s = setting(key);
            String target = targetOverride != null ? targetOverride : s.target();
            List<LocalDate> dates = job.targets().isEmpty() ? List.of() : datesFor(target, LocalDate.now(IST));
            job.task().accept(dates);
            lastRuns.put(key, new LastRun(java.time.OffsetDateTime.now(IST), true, "Finished", by));
        } catch (RuntimeException | Error e) {
            log.error("[schedulers] {} failed", key, e);
            lastRuns.put(key, new LastRun(java.time.OffsetDateTime.now(IST), false,
                    e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage(), by));
        } finally {
            running.remove(key);
        }
    }

    // The saved setting; when the job has none yet it is created from the default
    private Setting setting(String key) {
        Job job = jobs.get(key);
        if (job == null) return null;

        List<Setting> rows = jdbc.query("SELECT cron_expr, enabled, target FROM scheduler_settings WHERE job_key = ?",
                (rs, i) -> new Setting(rs.getString(1), rs.getBoolean(2), validTarget(job, rs.getString(3))), key);
        if (!rows.isEmpty()) return rows.get(0);

        boolean off = "-".equals(job.defaultCron() == null ? "" : job.defaultCron().trim());
        Setting initial = new Setting(cleanDefault(job.defaultCron()), !off, validTarget(job, null));
        try {
            saveSetting(key, initial.cron(), initial.enabled(), initial.target());
        } catch (RuntimeException e) {
            log.warn("[schedulers] could not save the default of {}: {}", key, e.getMessage());
        }
        return initial;
    }

    private void saveSetting(String key, String cron, boolean enabled, String target) {
        int n = jdbc.update("UPDATE scheduler_settings SET cron_expr = ?, enabled = ?, target = ?, updated_at = NOW() WHERE job_key = ?",
                cron, enabled, target, key);
        if (n == 0) {
            jdbc.update("INSERT INTO scheduler_settings (job_key, cron_expr, enabled, target, updated_at) VALUES (?, ?, ?, ?, NOW())",
                    key, cron, enabled, target);
        }
    }

    // A saved date choice the job still offers, else the job's default (null for a job without date choices)
    private static String validTarget(Job job, String saved) {
        if (job.targets().isEmpty()) return null;
        return saved != null && job.targets().contains(saved) ? saved : job.defaultTarget();
    }

    private static String cleanDefault(String cron) {
        String c = cron == null ? "" : cron.trim();
        return c.isEmpty() || c.equals("-") || !CronExpression.isValidExpression(c) ? FALLBACK_CRON : c;
    }

    private static java.time.OffsetDateTime offset(ZonedDateTime t) {
        return t == null ? null : t.toOffsetDateTime();
    }

    private static ZonedDateTime next(String cron, ZonedDateTime from) {
        try {
            return CronExpression.parse(cron).next(from);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @PreDestroy
    void shutdown() {
        scheduler.shutdown();
    }
}
