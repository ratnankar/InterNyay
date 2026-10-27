package com.internyay.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

// State of the automatic cause list scheduler, shown on the admin page
public record CauseListScheduleDto(
        boolean enabled,
        // Hours (IST, 24 hour clock) the scheduler runs at, for the evening before the hearing date
        List<Integer> hours,
        // True when the midnight (12 AM) run for the day that has just started is on
        boolean midnightRun,
        boolean captchaSolverAvailable,
        boolean running,
        OffsetDateTime nextRunAt,
        // The hearing date the next run will look up
        LocalDate nextRunFor,
        CauseListRunDto lastRun) {
}
