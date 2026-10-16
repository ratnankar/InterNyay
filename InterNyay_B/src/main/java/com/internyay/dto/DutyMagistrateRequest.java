package com.internyay.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;

// Used by the admin to add or edit a duty magistrate row
@Data
public class DutyMagistrateRequest {

    @NotNull(message = "Select the duty magistrate from the Judges List")
    // Judge is picked from the Judges List
    private Long judgeId;

    private String workingDay;

    private String holiday;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate issuedOn;

    // Period of the duty, yyyy-MM-dd
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate fromDate;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate tillDate;

    private boolean furtherOrder;
}
