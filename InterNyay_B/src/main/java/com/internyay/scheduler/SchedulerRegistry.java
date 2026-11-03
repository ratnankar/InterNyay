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

    // Most run times one job can have (the first one included), and the separator they are stored with
    public static final int MAX_TIMES = 6;
    private static final String TIME_SEPARATOR = "|";

    private static final String FALLBACK_CRON = "0 0 0 * * *";

    // Who started a run (shown on the Scheduler screen; the frontend compares with BY_RUN_NOW)
    private static final String BY_SCHEDULE = "Schedule";
    private static final String BY_RUN_NOW = "Run now";

    // Which hearing date(s) a job can be pointed at. Resolved on the day the job runs (IST)
    public static final List<String> TARGETS = List.of("YESTERDAY", "TODAY", "TOMORROW", "DAY_AFTER", "TODAY_TOMORROW", "NEXT_3_DAYS", "NEXT_7_DAYS");

    public record Job(String key, String label, String description, String defaultCron, List<String> targets,
                      String defaultTarget, Consumer<List<LocalDate>> task) {}

    // cron is the first time; extraCrons are the further times of the same job (empty when it has just one).
    // extraTargets has one entry per extra time (same order): the hearing date choice of that time, null = same as target
    public record Setting(String cron, List<String> extraCrons, List<String> extraTargets, boolean enabled, String target) {
        // Every time the job runs at, the first one first
        public List<String> allCrons() {
            List<String> all = new ArrayList<>();
            all.add(cron);
            all.addAll(extraCrons);
            return all;
        }

        // Every time together with the date choice it looks up (a time without its own choice uses the job's)
        public List<Timed> timed() {
            List<Timed> all = new ArrayList<>();
            all.add(new Timed(cron, target));
            for (int i = 0; i < extraCrons.size(); i++) {
                String own = i < extraTargets.size() ? extraTargets.get(i) : null;
                all.add(new Timed(extraCrons.get(i), own != null ? own : target));
            }
            return all;
        }
    }

    // One run time and the date choice it looks up
    public record Timed(String cron, String target) {}

    public record LastRun(java.time.OffsetDateTime at, boolean ok, String message, String by) {}

    public record JobView(String key, String label, String description, String cron, List<String> extraCrons, List<String> extraTargets, boolean enabled,
                          String defaultCron, java.time.OffsetDateTime nextRun,
                          List<String> targets, String target, String defaultTarget, List<LocalDate> dates,
                          boolean running, LastRun lastRun) {}

    // The hearing dates a target means, counted from the given day
    public static List<LocalDate> datesFor(String target, LocalDate today) {
        if (target == null) return List.of();
        return switch (target) {
            case "YESTERDAY" -> List.of(today.minusDays(1));
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
    private final Map<String, List<ScheduledFuture<?>>> futures = new ConcurrentHashMap<>();
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

    // Every saved time of a job (the first one and the extra ones); empty when the job is switched off
    public List<String> cronsOf(String key) {
        Setting s = setting(key);
        return s == null || !s.enabled() ? List.of() : s.allCrons();
    }

    // Every saved time of a job with the date choice of each; empty when the job is switched off
    public List<Timed> timesOf(String key) {
        Setting s = setting(key);
        return s == null || !s.enabled() ? List.of() : s.timed();
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
        return new JobView(j.key(), j.label(), j.description(), s.cron(), s.extraCrons(), effectiveExtraTargets(s), s.enabled(), cleanDefault(j.defaultCron()),
                s.enabled() ? offset(earliest(s.allCrons(), now)) : null,
                j.targets(), s.target(), j.defaultTarget(), datesFor(s.target(), now.toLocalDate()),
                running.contains(j.key()), lastRuns.get(j.key()));
    }

    // The date choice of each extra time as it applies (a time without its own choice shows the job's)
    private static List<String> effectiveExtraTargets(Setting s) {
        List<Timed> all = s.timed();
        List<String> out = new ArrayList<>();
        for (int i = 1; i < all.size(); i++) out.add(all.get(i).target());
        return out;
    }

    // Saves a new time / on-off state / date choice and applies it straight away. Throws IllegalArgumentException with a
    // message the admin can read when something is not acceptable
    public synchronized JobView update(String key, String cron, List<String> extraCrons, List<String> extraTargets,
                                       boolean enabled, String target) {
        Job job = jobs.get(key);
        if (job == null) throw new java.util.NoSuchElementException("Unknown job");

        String clean = tidy(cron);
        validate(clean);

        String chosen = checkTarget(job, target, setting(key).target());

        // The further times: each one valid, none repeated. Each keeps its own date choice (blank = the job's)
        List<String> extras = new ArrayList<>();
        List<String> extraChoices = new ArrayList<>();
        if (extraCrons != null) {
            for (int i = 0; i < extraCrons.size(); i++) {
                String t = tidy(extraCrons.get(i));
                if (t.isEmpty()) continue;
                validate(t);
                if (t.equals(clean) || extras.contains(t)) continue;
                extras.add(t);
                String own = extraTargets != null && i < extraTargets.size() ? extraTargets.get(i) : null;
                extraChoices.add(checkTarget(job, own, chosen));
            }
        }
        if (extras.size() + 1 > MAX_TIMES) throw new IllegalArgumentException("A job can have at most " + MAX_TIMES + " times");

        saveSetting(key, clean, extras, extraChoices, enabled, chosen);
        apply(key);
        log.info("[schedulers] {} set to '{}'{} ({}){}", key, clean, extras.isEmpty() ? "" : " + " + extras, enabled ? "on" : "off", chosen == null ? "" : " for " + chosen + (extraChoices.isEmpty() ? "" : " + " + extraChoices));
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

    private static String tidy(String cron) {
        return cron == null ? "" : cron.trim().replaceAll("\\s+", " ");
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
        List<ScheduledFuture<?>> old = futures.remove(key);
        if (old != null) old.forEach(f -> f.cancel(false));

        Job job = jobs.get(key);
        Setting s = setting(key);
        if (job == null || s == null || !s.enabled()) return;

        // One trigger per time, each with its own date choice; a time that cannot be scheduled does not stop the others
        List<ScheduledFuture<?>> started = new ArrayList<>();
        for (Timed time : s.timed()) {
            String choice = time.target();
            try {
                started.add(scheduler.schedule(() -> runJob(job, choice, BY_SCHEDULE), new CronTrigger(time.cron(), IST)));
            } catch (RuntimeException e) {
                log.error("[schedulers] {} could not be scheduled with '{}': {}", key, time.cron(), e.getMessage());
            }
        }
        futures.put(key, started);
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

        List<Setting> rows = jdbc.query("SELECT cron_expr, enabled, target, extra_crons, extra_targets FROM scheduler_settings WHERE job_key = ?",
                (rs, i) -> build(job, rs.getString(1), rs.getString(4), rs.getString(5), rs.getBoolean(2), rs.getString(3)), key);
        if (!rows.isEmpty()) return rows.get(0);

        boolean off = "-".equals(job.defaultCron() == null ? "" : job.defaultCron().trim());
        Setting initial = new Setting(cleanDefault(job.defaultCron()), List.of(), List.of(), !off, validTarget(job, null));
        try {
            saveSetting(key, initial.cron(), initial.extraCrons(), initial.extraTargets(), initial.enabled(), initial.target());
        } catch (RuntimeException e) {
            log.warn("[schedulers] could not save the default of {}: {}", key, e.getMessage());
        }
        return initial;
    }

    private void saveSetting(String key, String cron, List<String> extraCrons, List<String> extraTargets, boolean enabled, String target) {
        String extras = extraCrons.isEmpty() ? null : String.join(TIME_SEPARATOR, extraCrons);
        // One entry per extra time, empty when it has no date choice; nothing is stored when none has one
        String choices = null;
        if (!extraCrons.isEmpty() && extraTargets.stream().anyMatch(t -> t != null && !t.isBlank())) {
            List<String> parts = new ArrayList<>();
            for (int i = 0; i < extraCrons.size(); i++) {
                String t = i < extraTargets.size() ? extraTargets.get(i) : null;
                parts.add(t == null ? "" : t);
            }
            choices = String.join(TIME_SEPARATOR, parts);
        }
        int n = jdbc.update("UPDATE scheduler_settings SET cron_expr = ?, extra_crons = ?, extra_targets = ?, enabled = ?, target = ?, updated_at = NOW() WHERE job_key = ?",
                cron, extras, choices, enabled, target, key);
        if (n == 0) {
            jdbc.update("INSERT INTO scheduler_settings (job_key, cron_expr, extra_crons, extra_targets, enabled, target, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
                    key, cron, extras, choices, enabled, target);
        }
    }

    // A setting read from the table. The extra times and their date choices are read together so they stay in step:
    // a time that is not valid is dropped with its choice, and a choice the job no longer offers falls back to the job's
    private static Setting build(Job job, String cron, String storedTimes, String storedTargets, boolean enabled, String target) {
        List<String> times = new ArrayList<>();
        List<String> choices = new ArrayList<>();
        if (storedTimes != null && !storedTimes.isBlank()) {
            String[] timeParts = storedTimes.split("\\" + TIME_SEPARATOR, -1);
            String[] choiceParts = storedTargets == null ? new String[0] : storedTargets.split("\\" + TIME_SEPARATOR, -1);
            for (int i = 0; i < timeParts.length; i++) {
                String c = tidy(timeParts[i]);
                if (c.isEmpty() || !CronExpression.isValidExpression(c)) continue;
                times.add(c);
                String own = i < choiceParts.length ? choiceParts[i].trim() : "";
                choices.add(!own.isEmpty() && job.targets().contains(own) ? own : null);
            }
        }
        return new Setting(cron, times, choices, enabled, validTarget(job, target));
    }

    // The soonest next run among several times
    private static ZonedDateTime earliest(List<String> crons, ZonedDateTime from) {
        ZonedDateTime best = null;
        for (String c : crons) {
            ZonedDateTime n = next(c, from);
            if (n != null && (best == null || n.isBefore(best))) best = n;
        }
        return best;
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
