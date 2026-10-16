package com.internyay.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.util.List;
import java.util.Map;

// Body to create or update a case. Dates and amounts come as text and are parsed in the service
@Data
public class CaseRequest {

    // Required fields
    @NotBlank @Size(max = 500) public String title;
    @NotBlank public String caseNo;
    @NotBlank public String court;

    public String district;

    @Size(max = 30) public String courtNo;

    // File number of the advocate
    public String fileNo;

    public Integer fileSeq;

    public String cnrNo;

    public String filingDate;

    // COMPLAINANT or ACCUSED
    public String clientSide;
    @Size(max = 255) public String opposingParty;

    @Size(max = 255) public String opposingFatherName;
    @Size(max = 500) public String opposingAddress;
    @Size(max = 30)  public String opposingPhone;

    // Civil or Criminal
    public String caseNature;
    @Size(max = 255) public String reliefSought;
    @Size(max = 255) public String caseType;

    // FIR details
    @Size(max = 100) public String firNo;
    @Size(max = 255) public String firSection;
    @Size(max = 255) public String policeStation;

    // Cheque bounce details
    @Size(max = 50) public String chequeNo;
    public String chequeDate;
    public String memoDate;
    @Size(max = 255) public String bouncingReason;
    public String claimAmount;
    public String noticeDate;

    public String status;
    public String description;

    public String nextHearing;

    // OLD: a case already running in court, its hearing history and next date come from eCourts using the CNR.
    // FRESH (or empty): a new case
    public String caseAge;

    // True for an old case
    public boolean isOldCase() { return "OLD".equalsIgnoreCase(caseAge == null ? "" : caseAge.trim()); }

    // Main client is required, others are optional
    @NotNull public Long clientId;

    public List<Long> additionalClientIds;

    // Role of each client in the case
    public Map<Long, String> clientSubTypes;

    // Fee details
    public String feeType;
    public String totalFeeAmount;
    public Boolean totalFeePaid;

    public String initialAmount;
    public Boolean initialPaid;

    public String dateWiseAmount;
    public List<HearingFeeRequest> hearingFees;

    public List<StageFeeRequest> stageFees;

    // Drops all fee fields, used when the user is not allowed to change fees
    public void clearFees() {
        this.feeType = null;
        this.totalFeeAmount = null;
        this.totalFeePaid = null;
        this.initialAmount = null;
        this.initialPaid = null;
        this.dateWiseAmount = null;
        this.hearingFees = null;
        this.stageFees = null;
    }
}
