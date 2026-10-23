package com.internyay.dto;

import java.util.List;

public record CauseListRelayStep(
        String status,
        String sessionId,
        String captchaImage,
        String court,
        String district,
        String courtNo,
        int caseCount,
        int remaining,
        int done,
        int saved,
        String message,
        List<String> skipped) {
}
