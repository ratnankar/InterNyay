package com.internyay.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CauseListAutoRunServiceTest {

    // The evening schedule: every hour from 5 PM to 11 PM
    @Test
    void eveningCronRunsEveryHourFiveToElevenPm() {
        assertEquals(List.of(17, 18, 19, 20, 21, 22, 23), CauseListAutoRunService.hoursOf("0 0 17-23 * * *"));
    }

    // The 12 AM run for the day that has just started
    @Test
    void midnightCronRunsAtTwelveAm() {
        assertEquals(List.of(0), CauseListAutoRunService.hoursOf("0 0 0 * * *"));
    }

    @Test
    void switchedOffOrBrokenCronHasNoHours() {
        assertEquals(List.of(), CauseListAutoRunService.hoursOf("-"));
        assertEquals(List.of(), CauseListAutoRunService.hoursOf("not a cron"));
    }
}
