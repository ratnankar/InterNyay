package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class CourtNoRecordRequest {

    @NotBlank(message = "Court number is required")
    private String courtRoomNo;

    @NotNull(message = "From date is required")
    private LocalDate fromDate;

    // Required for a past period; the current period has no till date
    private LocalDate tillDate;

    // Optional building of the court during this period
    private String building;

    private String floor;

    // Court and district of this period; the judge's own court and district are used when left out
    private String court;

    private String district;
}
