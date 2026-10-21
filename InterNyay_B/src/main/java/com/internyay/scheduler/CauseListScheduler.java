package com.internyay.scheduler;

import com.internyay.service.CauseListService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

// Fetches cause list numbers from eCourts on a schedule
@Component
@RequiredArgsConstructor
@Slf4j
public class CauseListScheduler {

    private final CauseListService service;

    // Also fetch missing numbers when the app starts
    @Value("${ecourts.api.startup-catchup:true}")
    private boolean startupCatchUp;

    // Evening run, gets tomorrow's cause list numbers
    @Scheduled(cron = "${ecourts.api.cron:0 18 19 * * *}", zone = "Asia/Kolkata")
    public void fetchTomorrowsCauseListNos() {
        run("7:18 PM run", () -> service.fetchForTomorrow());
    }

    // Catch up on startup in case the app was down at the scheduled time
    @EventListener(ApplicationReadyEvent.class)
    public void catchUpOnStartup() {
        // Switched off in application.properties
        if (!startupCatchUp) return;

        // Runs in the background so startup is not slowed down
        CompletableFuture.runAsync(() -> {
            run("startup catch-up (today)", () -> service.fetchMissingForToday());
            run("startup catch-up (tomorrow)", () -> service.fetchMissingForTomorrow());
        });
    }

    // Runs a job and logs the failure instead of stopping the scheduler
    private void run(String what, Runnable job) {
        try {
            log.info("Cause-list {}", what);
            job.run();
        } catch (Exception e) {
            log.error("Cause-list {} failed", what, e);
        }
    }
}
