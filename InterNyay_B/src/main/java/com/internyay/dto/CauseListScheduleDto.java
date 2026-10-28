package com.internyay.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

// State of the automatic cause list scheduler, shown on the admin page
public record CauseListScheduleDto(
        boolean enabled,
        // Hours (IST, 24 hour clock) the scheduler runs at, for the evening before the hearing date
        List<Integer> hours,
        boolean captchaSolverAvailable,
        boolean running,
        OffsetDateTime nextRunAt,
        // The hearing date the next run will look up
        LocalDate nextRunFor,
        CauseListRunDto lastRun) {
}
