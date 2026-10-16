package com.internyay.scheduler;

import com.internyay.service.DailyJudgeLeaveService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

// Refreshes the judges on leave list from the district court websites
@Slf4j
@Component
@RequiredArgsConstructor
public class JudgeLeaveScheduler {

    private final DailyJudgeLeaveService service;

    // Every hour, on the hour, by default. The times come from judgeleave.scrape.cron in application.properties
    @Scheduled(
            cron = "${judgeleave.scrape.cron:0 0 * * * *}",
            zone = "Asia/Kolkata"
    )
    public void scrapeJudgesOnLeave() {

        log.info("Starting scheduled Judges On Leave scraping...");

        service.scrapeAllDistricts();
    }

    // Also refresh once when the app starts
    @EventListener(ApplicationReadyEvent.class)
    public void scrapeOnStartup() {

        log.info("Application ready — refreshing Judges On Leave in the background...");

        // Background run so startup is not blocked
        CompletableFuture.runAsync(service::scrapeAllDistricts);
    }
}