package com.internyay.scheduler;

import com.internyay.service.WhatsAppReminderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// Sends the daily WhatsApp reminders for tomorrow's hearings
@Component
@RequiredArgsConstructor
@Slf4j
public class WhatsAppReminderScheduler {

    private final WhatsAppReminderService service;

    // Time comes from whatsapp.reminder.cron
    @Scheduled(cron = "${whatsapp.reminder.cron:0 0 10 * * *}", zone = "Asia/Kolkata")
    public void remindClientsOfTomorrowsHearings() {
        try {
            service.sendTomorrowsReminders();
        } catch (Exception e) {
            log.error("WhatsApp reminder run failed", e);
        }
    }
}
