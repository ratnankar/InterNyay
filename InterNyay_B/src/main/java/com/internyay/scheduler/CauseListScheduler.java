package com.internyay.scheduler;

import com.internyay.entity.CauseListRunLog.Origin;
import com.internyay.service.CauseListAutoRunService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.concurrent.CompletableFuture;

// Looks up cause list numbers for the chosen hearing date(s), by default tomorrow, every hour in the evening (5 PM to 11 PM). Delhi High Court and Supreme Court numbers come from the published PDFs, district
// court numbers from the eCourts portal with the CAPTCHA read by the solver. Every run only looks up the cases that
// still have no number, so a later run picks up whatever an earlier one could not get (the Supreme Court publishes its
// list late in the evening, and a CAPTCHA can fail). Each run is recorded in Admin > Cause List.
@Component
@RequiredArgsConstructor
@Slf4j
public class CauseListScheduler {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final CauseListAutoRunService autoRun;
    private final SchedulerRegistry registry;

    // Starting times (changed in Admin > Schedulers; these are only used until the admin saves one)
    @Value("${causelist.auto.cron:0 0 17-23 * * *}")
    private String cron;

    // Also fetch missing numbers when the app starts
    @Value("${ecourts.api.startup-catchup:true}")
    private boolean startupCatchUp;

    @PostConstruct
    void register() {
        registry.register("causelist_evening", "Cause list numbers",
                "Looks up the cause list numbers of the chosen hearing date(s) for cases that still have none.", cron,
                "TOMORROW", this::run);
    }

    // 5 PM, 6 PM ... 11 PM by default, for the hearing date(s) chosen in Admin > Schedulers (tomorrow until changed)
    public void run(List<LocalDate> dates) {
        String label = clock(ZonedDateTime.now(IST)) + " run";
        for (LocalDate date : dates) {
            autoRun.runForDate(date, dates.size() > 1 ? label + " (" + date + ")" : label);
        }
    }

    // Catch up on startup in case the app was down at the scheduled time
    @EventListener(ApplicationReadyEvent.class)
    public void catchUpOnStartup() {
        // Switched off in application.properties
        if (!startupCatchUp || !autoRun.enabled()) return;

        // Runs in the background so startup is not slowed down
        CompletableFuture.runAsync(() -> {
            try {
                autoRun.runBlocking(LocalDate.now(IST), Origin.AUTO, "Startup catch-up (today)");
                autoRun.runBlocking(LocalDate.now(IST).plusDays(1), Origin.AUTO, "Startup catch-up (tomorrow)");
            } catch (RuntimeException e) {
                log.error("Cause-list startup catch-up failed", e);
            }
        });
    }

    // "5 PM" for the hour the run started at
    private static String clock(ZonedDateTime time) {
        int hour = time.getHour();
        int twelve = hour % 12 == 0 ? 12 : hour % 12;
        return twelve + (hour < 12 ? " AM" : " PM");
    }
}
