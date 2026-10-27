package com.internyay.scheduler;

import com.internyay.entity.CauseListRunLog.Origin;
import com.internyay.service.CauseListAutoRunService;
import com.internyay.service.CauseListRunLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.concurrent.CompletableFuture;

// Looks up cause list numbers for the next hearing date every hour in the evening (5 PM to 11 PM), and once more at
// 12 AM for the day that has just begun. Delhi High Court and Supreme Court numbers come from the published PDFs, district
// court numbers from the eCourts portal with the CAPTCHA read by the solver. Every run only looks up the cases that
// still have no number, so a later run picks up whatever an earlier one could not get (the Supreme Court publishes its
// list late in the evening, and a CAPTCHA can fail). Each run is recorded in Admin > Cause List.
@Component
@RequiredArgsConstructor
@Slf4j
public class CauseListScheduler {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final CauseListAutoRunService autoRun;
    private final CauseListRunLogService runLog;

    // Also fetch missing numbers when the app starts
    @Value("${ecourts.api.startup-catchup:true}")
    private boolean startupCatchUp;

    // 5 PM, 6 PM ... 11 PM: gets tomorrow's cause list numbers (change with causelist.auto.cron, "-" switches it off)
    @Scheduled(cron = "${causelist.auto.cron:0 0 17-23 * * *}", zone = "Asia/Kolkata")
    public void hourlyEveningRun() {
        autoRun.runForTomorrow(clock(ZonedDateTime.now(IST)) + " run");
    }

    // 12 AM: the hearing day has just started, last chance to fill what the evening runs could not
    @Scheduled(cron = "${causelist.auto.midnight.cron:0 0 0 * * *}", zone = "Asia/Kolkata")
    public void midnightRun() {
        autoRun.runForToday("12 AM run");
    }

    // Old run log entries are removed once a day
    @Scheduled(cron = "0 30 3 * * *", zone = "Asia/Kolkata")
    public void purgeOldRuns() {
        try {
            runLog.purgeOld();
        } catch (RuntimeException e) {
            log.warn("Cause-list run log cleanup failed: {}", e.getMessage());
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
