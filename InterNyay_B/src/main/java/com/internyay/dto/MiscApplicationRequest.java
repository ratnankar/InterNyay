package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

// Body to add or edit a misc. application. Dates come as yyyy-MM-dd text and are parsed in the service
@Data
public class MiscApplicationRequest {

    // Add only: EXISTING (the application is filed in a case the advocate already has) or NEW (the case is created with it)
    public String caseMode;

    // EXISTING: the case
    public Long caseId;

    // NEW: the case that is created. Title is typed by hand; case no. and CNR are needed because every case has them
    public Long clientId;
    @Size(max = 500) public String caseTitle;
    @Size(max = 255) public String caseNo;
    public String cnrNo;
    public String court;
    public String district;

    // Chosen from the document types or typed by hand
    @NotBlank @Size(max = 255) public String applicationType;

    // What happened so far, shown on the application and added to the case's hearing history
    @Size(max = 5000) public String history;

    public String filingDate;
    public String hearingDate;

    // True for a request that creates a new case
    public boolean isNewCase() { return "NEW".equalsIgnoreCase(caseMode == null ? "" : caseMode.trim()); }
}
