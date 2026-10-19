package com.internyay.dto;

import com.internyay.entity.Case;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Full case details sent to the frontend, fees and documents included
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CaseDto {

    public Long id;
    public String title;
    public String caseNo;
    public String fileNo;
    public Integer fileSeq;
    public String cnrNo;
    public LocalDate filingDate;

    public String clientSide;
    public String opposingParty;
    public String opposingFatherName;
    public String opposingAddress;
    public String opposingPhone;

    public String court;
    public String district;
    public String courtNo;
    public String building;
    public String floor;

    // Judge of the court room, filled in by the service
    public String judgeName;

    // Civil or Criminal
    public String caseNature;
    public String reliefSought;
    public String caseType;

    public String firNo;
    public String firSection;
    public String policeStation;
    // Id of the matching police station row, null when the name is unknown or ambiguous
    public Long policeStationId;

    public String chequeNo;
    public LocalDate chequeDate;
    public LocalDate memoDate;
    public String bouncingReason;
    public BigDecimal claimAmount;
    public LocalDate noticeDate;

    public String status;
    public String description;
    public LocalDate nextHearing;

    // Main client and the other clients of the case
    public Long clientId;
    public String clientName;

    public List<ClientRefDto> additionalClients;

    // Role of each client in the case
    public Map<Long, String> clientSubTypes;

    // Fee details, which fields are used depends on the fee type
    public String feeType;
    public BigDecimal totalFeeAmount;
    public LocalDate totalFeeAmountDate;
    public boolean totalFeePaid;
    public BigDecimal initialAmount;
    public LocalDate initialAmountDate;
    public boolean initialPaid;
    public BigDecimal dateWiseAmount;
    public List<HearingFeeDto> hearingFees;
    public List<StageFeeDto> stageFees;

    // WhatsApp reminder settings of the case
    public boolean whatsappReminders;

    public int reminderDaysBefore;

    // Documents attached to the case
    public List<DocumentDto> documents;

    public LocalDateTime createdAt;

    // Last time the case was changed, used for the Recently Updated sort
    public LocalDateTime updatedAt;

    // Clears all fee fields, used for users who must not see fees
    public CaseDto withoutFees() {
        this.feeType = null;
        this.totalFeeAmount = null;
        this.totalFeeAmountDate = null;
        this.totalFeePaid = false;
        this.initialAmount = null;
        this.initialAmountDate = null;
        this.initialPaid = false;
        this.dateWiseAmount = null;
        this.hearingFees = List.of();
        this.stageFees = List.of();
        return this;
    }

    // Case without documents
    public static CaseDto from(Case c) {
        return from(c, List.of());
    }

    // Builds the DTO from the entity, empty lists are used where nothing is set
    public static CaseDto from(Case c, List<DocumentDto> documents) {

        List<DocumentDto> docs = documents != null ? documents : List.of();

        List<HearingFeeDto> fees = c.getHearingFees() == null
                ? List.of()
                : c.getHearingFees().stream().map(HearingFeeDto::from).toList();

        List<StageFeeDto> stages = c.getStageFees() == null
                ? List.of()
                : c.getStageFees().stream().map(StageFeeDto::from).toList();

        List<ClientRefDto> extraClients = c.getAdditionalClients() == null
                ? List.of()
                : c.getAdditionalClients().stream().map(ClientRefDto::from).toList();

        return CaseDto.builder()
                .id(c.getId())
                .title(c.getTitle())
                .caseNo(c.getCaseNo())
                .fileNo(c.getFileNo())
                .fileSeq(c.getFileSeq())
                .cnrNo(c.getCnrNo())
                .filingDate(c.getFilingDate())
                .clientSide(c.getClientSide())
                .opposingParty(c.getOpposingParty())
                .opposingFatherName(c.getOpposingFatherName())
                .opposingAddress(c.getOpposingAddress())
                .opposingPhone(c.getOpposingPhone())
                .court(c.getCourt())
                .district(c.getDistrict())
                .courtNo(c.getCourtNo())
                .building(c.getBuilding())
                .floor(c.getFloor())
                .caseNature(c.getCaseNature())
                .reliefSought(c.getReliefSought())
                .caseType(c.getCaseType())
                .firNo(c.getFirNo())
                .firSection(c.getFirSection())
                .policeStation(c.getPoliceStation())
                .policeStationId(c.getPoliceStationId())
                .chequeNo(c.getChequeNo())
                .chequeDate(c.getChequeDate())
                .memoDate(c.getMemoDate())
                .bouncingReason(c.getBouncingReason())
                .claimAmount(c.getClaimAmount())
                .noticeDate(c.getNoticeDate())
                .status(c.getStatus())
                .description(c.getDescription())
                .nextHearing(c.getNextHearing())
                .clientId(c.getClient() != null ? c.getClient().getId() : null)
                .clientName(c.getClient() != null ? c.getClient().getName() : null)
                .additionalClients(extraClients)
                .clientSubTypes(c.getClientSubTypes() == null
                        ? new LinkedHashMap<>()
                        : new LinkedHashMap<>(c.getClientSubTypes()))
                .feeType(c.getFeeType())
                .totalFeeAmount(c.getTotalFeeAmount())
                .totalFeeAmountDate(c.getTotalFeeAmountDate())
                .totalFeePaid(c.isTotalFeePaid())
                .initialAmount(c.getInitialAmount())
                .initialAmountDate(c.getInitialAmountDate())
                .initialPaid(c.isInitialPaid())
                .dateWiseAmount(c.getDateWiseAmount())
                .hearingFees(fees)
                .stageFees(stages)
                .whatsappReminders(c.isWhatsappRemindersEnabled())
                .reminderDaysBefore(c.getReminderDaysBeforeOrDefault())
                .documents(docs)
                .createdAt(c.getCreatedAt())
                .updatedAt(c.getUpdatedAt())
                .build();
    }
}
