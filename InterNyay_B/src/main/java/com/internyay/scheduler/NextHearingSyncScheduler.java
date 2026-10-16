package com.internyay.scheduler;

import com.internyay.service.NextHearingSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// Syncs next hearing dates from eCourts after court hours
@Component
@RequiredArgsConstructor
@Slf4j
public class NextHearingSyncScheduler {

    private final NextHearingSyncService service;

    // Runs at 6 PM IST
    @Scheduled(cron = "${ecourts.api.next-hearing-cron:0 0 18 * * *}", zone = "Asia/Kolkata")
    public void syncTodaysHearings() {
        try {
            log.info("Next-hearing sync: 6 PM run");
            service.syncForToday();
        } catch (Exception e) {
            log.error("Next-hearing sync 6 PM run failed", e);
        }
    }
}
