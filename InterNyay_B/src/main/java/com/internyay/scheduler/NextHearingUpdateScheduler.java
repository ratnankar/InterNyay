package com.internyay.scheduler;

import com.internyay.service.NextHearingUpdateService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalTime;
import java.time.ZoneId;
import java.util.concurrent.CompletableFuture;

// Updates the next hearing date of cases from eCourts, every hour from 5 PM to 11 PM on the hearing date and once more
// at 12 AM (the hearing date has just ended). A case whose next hearing date is still the hearing date has not been
// moved on yet, so each run asks eCourts again for exactly those cases: the court may put the new date up late in the
// evening, and a portal or CAPTCHA failure only costs that case one run. Cases that already moved are not touched.
@Component
@RequiredArgsConstructor
@Slf4j
public class NextHearingUpdateScheduler {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final NextHearingUpdateService update;

    // Also run once when the app starts inside the 5 PM to 12 AM window (nexthearing.update.startup-catchup)
    @Value("${nexthearing.update.startup-catchup:true}")
    private boolean startupCatchUp;

    // 5 PM, 6 PM ... 11 PM: today is the hearing date (change with nexthearing.update.cron, "-" switches it off)
    @Scheduled(cron = "${nexthearing.update.cron:0 0 17-23 * * *}", zone = "Asia/Kolkata")
    public void hourlyEveningRun() {
        update.runForToday();
    }

    // 12 AM: yesterday was the hearing date, last try for the cases still on it
    @Scheduled(cron = "${nexthearing.update.midnight.cron:0 0 0 * * *}", zone = "Asia/Kolkata")
    public void midnightRun() {
        update.runForYesterday();
    }

    // Catch up when the app was restarted during the window
    @EventListener(ApplicationReadyEvent.class)
    public void catchUpOnStartup() {
        if (!startupCatchUp || !update.enabled()) return;

        LocalTime now = java.time.ZonedDateTime.now(IST).toLocalTime();
        boolean evening = !now.isBefore(LocalTime.of(17, 0));
        // 12 AM run's window: until the first hour after midnight is over
        boolean afterMidnight = now.isBefore(LocalTime.of(1, 0));
        if (!evening && !afterMidnight) return;

        // Background, so startup is not slowed down
        CompletableFuture.runAsync(() -> {
            try {
                if (afterMidnight) update.runForYesterday(); else update.runForToday();
            } catch (RuntimeException e) {
                log.error("Next hearing date startup catch-up failed", e);
            }
        });
    }
}
