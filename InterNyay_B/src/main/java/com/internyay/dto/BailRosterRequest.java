package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.util.List;

// Used by the admin to add or edit a bail roster row
@Data
public class BailRosterRequest {

    @NotBlank(message = "Court is required")
    private String court;

    @NotBlank(message = "District is required")
    private String district;

    // Judges picked from the Judges List
    private List<Long> judicialOfficerIds;

    // Judges used as quick links
    private Long linkOneJudgeId;
    private Long linkTwoJudgeId;

    private String policeStationAgencies;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate issuedOn;

    // Period the roster applies to, yyyy-MM-dd
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate fromDate;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate tillDate;

    // True when it runs until a further order
    private boolean furtherOrder;
}
