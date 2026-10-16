package com.internyay.dto;

// WhatsApp setup status shown to the user
public record WhatsAppStatusDto(
        // True when the API keys are set
        boolean configured,
        boolean dryRun,
        // Failed messages in the last 24 hours
        long failedLast24h) {}
