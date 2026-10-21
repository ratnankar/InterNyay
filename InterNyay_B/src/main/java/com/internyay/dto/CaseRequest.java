package com.internyay.dto;

import jakarta.validation.Valid;
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
    @Size(max = 255) public String building;
    @Size(max = 50) public String floor;

    // File number of the advocate, as typed by them. Empty means the next free number is given
    @Size(max = 255) public String fileNo;

    public Integer fileSeq;

    public String cnrNo;

    public String filingDate;

    // COMPLAINANT or ACCUSED
    public String clientSide;

    // Opposite parties. Null leaves them as they are, a list (even an empty one) replaces them
    public List<@Valid CasePartyRequest> opponents;

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

    // How the case is being added. CNR: the form was filled from eCourts using the CNR, so the next hearing and the
    // status come from the court. MANUAL (or empty): the advocate filled the form, his values are kept.
    // Either way the hearing and order history of the case is read from eCourts when it is saved
    public String addMode;

    // True when the case is added by CNR
    public boolean isCnrMode() { return "CNR".equalsIgnoreCase(addMode == null ? "" : addMode.trim()); }

    // Main client: required for every case except one added by CNR (checked in CaseService.create); others are optional
    public Long clientId;

    public List<Long> additionalClientIds;

    // Role of each client in the case
    public Map<Long, String> clientSubTypes;

    // People on our side who are not saved as clients. Null leaves them as they are, a list replaces them
    public List<@Valid CasePartyRequest> nonClients;

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
