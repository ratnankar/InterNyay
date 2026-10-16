package com.internyay.dto;

import java.time.LocalDate;

// New next hearing date and the history entry that was recorded, if any
public record NextHearingResponse(Long caseId, LocalDate nextHearing, HearingDto recorded) {}
