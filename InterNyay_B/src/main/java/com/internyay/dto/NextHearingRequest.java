package com.internyay.dto;

import lombok.Data;

import java.time.LocalDate;

// Moves a case to its next hearing and records what happened in the current one
@Data
public class NextHearingRequest {

    // New hearing date
    public LocalDate nextHearing;

    // Date of the hearing being closed, the current next hearing is used when empty
    public LocalDate closingDate;

    // Notes and outcome of the closed hearing, saved only when one is filled
    public String notes;
    public String outcome;
}
