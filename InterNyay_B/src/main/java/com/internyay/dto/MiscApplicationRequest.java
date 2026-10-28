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

    // NEW: the case that is created. Title is typed by hand; case no. and CNR are optional (a CNR that is typed must be valid)
    public Long clientId;
    @Size(max = 500) public String caseTitle;
    @Size(max = 255) public String caseNo;
    public String cnrNo;
    public String court;
    public String district;

    // Edit only: for an application filed in an existing case, caseId moves it to another case. For one added together with
    // a new case, caseTitle / caseNo / cnrNo / clientId / court / district edit that case (an empty caseNo or cnrNo clears it)

    // Chosen from the document types or typed by hand
    @NotBlank @Size(max = 255) public String applicationType;

    public String filingDate;
    public String hearingDate;

    // Edit only: note for the hearing just held (the previous next hearing date)
    @Size(max = 2000) public String note;

    // True for a request that creates a new case
    public boolean isNewCase() { return "NEW".equalsIgnoreCase(caseMode == null ? "" : caseMode.trim()); }
}
