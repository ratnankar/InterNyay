package com.internyay.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.time.LocalDate;

// Body to add or update a hearing
@Data
public class HearingRequest {

    @NotNull public Long caseId;
    @NotNull public LocalDate date;

    public String time;
    public String notes;
    public String outcome;
}
