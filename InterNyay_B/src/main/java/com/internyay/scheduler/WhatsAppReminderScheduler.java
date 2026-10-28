package com.internyay.scheduler;

import com.internyay.service.WhatsAppReminderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import jakarta.annotation.PostConstruct;

// Sends the daily WhatsApp reminders for tomorrow's hearings
@Component
@RequiredArgsConstructor
@Slf4j
public class WhatsAppReminderScheduler {

    private final WhatsAppReminderService service;
    private final SchedulerRegistry registry;

    // Starting time (changed in Admin > Schedulers; this is only used until the admin saves one)
    @Value("${whatsapp.reminder.cron:0 0 10 * * *}")
    private String cron;

    @PostConstruct
    void register() {
        registry.register("whatsapp_reminders", "WhatsApp hearing reminders",
                "Sends clients the reminder for tomorrow's hearings.", cron, this::remindClientsOfTomorrowsHearings);
    }

    public void remindClientsOfTomorrowsHearings() {
        try {
            service.sendTomorrowsReminders();
        } catch (Exception e) {
            log.error("WhatsApp reminder run failed", e);
        }
    }
}
