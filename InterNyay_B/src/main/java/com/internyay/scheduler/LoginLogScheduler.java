package com.internyay.scheduler;

import com.internyay.service.LoginLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// Deletes old login log rows once a day
@Component
@RequiredArgsConstructor
@Slf4j
public class LoginLogScheduler {

    private final LoginLogService service;

    // Time comes from loginlog.cleanup-cron, default 3:30 AM India time
    @Scheduled(cron = "${loginlog.cleanup-cron:0 30 3 * * *}", zone = "Asia/Kolkata")
    public void removeOldRows() {
        try {
            service.purgeOld();
        } catch (Exception e) {
            log.error("Login log cleanup failed", e);
        }
    }
}
