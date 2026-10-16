package com.internyay.util;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;

// When the wait for a hearing's order is over: from 6 PM (Indian time) on the hearing date, or any later day.
// After that, a date with no order on eCourts no longer offers "Get order"; "Attach Order PDF" always stays
public final class OrderCutoff {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final LocalTime CUTOFF = LocalTime.of(18, 0);

    private OrderCutoff() {}

    // True once the hearing date is past, or it is the hearing date and the time is 6 PM or later
    public static boolean passed(LocalDate hearingDate) {
        return hearingDate != null && !LocalDateTime.now(IST).isBefore(hearingDate.atTime(CUTOFF));
    }
}
