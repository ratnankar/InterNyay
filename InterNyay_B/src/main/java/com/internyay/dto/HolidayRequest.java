package com.internyay.dto;

import lombok.*;

import java.time.LocalDate;

// Used by the admin to add or edit a holiday
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class HolidayRequest {
    private LocalDate date;
    private String label;
    private String description;
    // DISTRICT, HIGH or BOTH
    private String courtType;
}
