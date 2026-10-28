package com.internyay.scheduler;

import com.internyay.service.NextHearingUpdateService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.CompletableFuture;

// Updates the next hearing date of cases from eCourts, every hour from 5 PM to 11 PM on the hearing date. A case whose next hearing date is still the hearing date has not been
// moved on yet, so each run asks eCourts again for exactly those cases: the court may put the new date up late in the
// evening, and a portal or CAPTCHA failure only costs that case one run. Cases that already moved are not touched.
@Component
@RequiredArgsConstructor
@Slf4j
public class NextHearingUpdateScheduler {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final NextHearingUpdateService update;
    private final SchedulerRegistry registry;

    // Starting times (changed in Admin > Schedulers; these are only used until the admin saves one)
    @Value("${nexthearing.update.cron:0 0 17-23 * * *}")
    private String cron;

    // Also run once when the app starts after 5 PM
    @Value("${nexthearing.update.startup-catchup:true}")
    private boolean startupCatchUp;

    @PostConstruct
    void register() {
        registry.register("nexthearing_evening", "Next hearing dates",
                "Asks eCourts for the new next hearing date of cases still on the chosen date(s).", cron,
                "TODAY", this::run);
    }

    // Times and dates are set in Admin > Schedulers (today's cases, every hour from 5 PM to 11 PM, until changed)
    public void run(List<LocalDate> dates) {
        for (LocalDate date : dates) update.runBlocking(date);
    }

    // Catch up when the app was restarted during the window
    @EventListener(ApplicationReadyEvent.class)
    public void catchUpOnStartup() {
        if (!startupCatchUp || !update.enabled()) return;

        LocalTime now = java.time.ZonedDateTime.now(IST).toLocalTime();
        if (now.isBefore(LocalTime.of(17, 0))) return;

        // Background, so startup is not slowed down
        CompletableFuture.runAsync(() -> {
            try {
                update.runForToday();
            } catch (RuntimeException e) {
                log.error("Next hearing date startup catch-up failed", e);
            }
        });
    }
}
