package com.internyay.dto;

import com.internyay.entity.Case;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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

    // eCourts case page details
    public String caseStage;
    public String actsSections;
    public LocalDate registrationDate;
    public LocalDate firstHearingDate;
    public LocalDate decisionDate;
    public String disposalNature;

    public String clientSide;

    // Opposite parties of the case
    public List<CasePartyDto> opponents;
    // Names of all opposite parties joined with " & ", for places that show one line (PDF forms, search)
    public String opposingParty;

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

    // People on our side who are not saved as clients
    public List<CasePartyDto> nonClients;

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
    // The advocate's own on/off choice (on unless switched off)
    public boolean whatsappReminders;

    // True when no client on the case has a WhatsApp number, so automatic reminders cannot run
    public boolean whatsappNumberMissing;

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

        List<CasePartyDto> opponents = c.getOpponents() == null
                ? List.of()
                : c.getOpponents().stream().map(CasePartyDto::from).toList();

        List<CasePartyDto> nonClients = c.getNonClients() == null
                ? List.of()
                : c.getNonClients().stream().map(CasePartyDto::from).toList();

        return CaseDto.builder()
                .id(c.getId())
                .title(c.getTitle())
                .caseNo(c.getCaseNo())
                .fileNo(c.getFileNo())
                .fileSeq(c.getFileSeq())
                .cnrNo(c.getCnrNo())
                .filingDate(c.getFilingDate())
                .caseStage(c.getCaseStage())
                .actsSections(c.getActsSections())
                .registrationDate(c.getRegistrationDate())
                .firstHearingDate(c.getFirstHearingDate())
                .decisionDate(c.getDecisionDate())
                .disposalNature(c.getDisposalNature())
                .clientSide(c.getClientSide())
                .opponents(opponents)
                .opposingParty(opponents.stream().map(o -> o.name).collect(Collectors.joining(" & ")))
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
                .nonClients(nonClients)
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
                .whatsappReminders(c.isWhatsappReminderPreferenceOn())
                .whatsappNumberMissing(!c.hasClientWhatsappNumber())
                .reminderDaysBefore(c.getReminderDaysBeforeOrDefault())
                .documents(docs)
                .createdAt(c.getCreatedAt())
                .updatedAt(c.getUpdatedAt())
                .build();
    }
}
