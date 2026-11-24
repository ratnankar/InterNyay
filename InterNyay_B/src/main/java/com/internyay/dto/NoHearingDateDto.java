package com.internyay.dto;

import java.time.LocalDate;

// A no-hearing date with the reason the advocate gave for it (reason is null when none was given)
public record NoHearingDateDto(LocalDate date, String reason) {
}
