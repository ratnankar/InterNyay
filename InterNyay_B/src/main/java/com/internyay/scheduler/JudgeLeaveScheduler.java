package com.internyay.scheduler;

import com.internyay.service.DailyJudgeLeaveService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

import java.util.concurrent.CompletableFuture;

// Refreshes the judges on leave list from the district court websites
@Slf4j
@Component
@RequiredArgsConstructor
public class JudgeLeaveScheduler {

    private final DailyJudgeLeaveService service;
    private final SchedulerRegistry registry;

    // Starting times (changed in Admin > Schedulers; these are only used until the admin saves one)
    @Value("${judgeleave.scrape.cron:0 0 * * * *}")
    private String cron;

    @PostConstruct
    void register() {
        registry.register("judge_leave_scrape", "Judges on Leave",
                "Reads the judges on leave from the district court websites.", cron, this::scrapeJudgesOnLeave);
    }

    // Every hour, on the hour, until the admin sets other times
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