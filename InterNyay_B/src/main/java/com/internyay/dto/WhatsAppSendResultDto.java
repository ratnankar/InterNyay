package com.internyay.dto;

import java.util.List;

// Result of sending WhatsApp reminders: counts and the problems found
public record WhatsAppSendResultDto(
        int sent,
        int failed,
        int noNumber,
        // True when nothing was actually sent
        boolean dryRun,
        List<String> problems) {}
