package com.internyay.dto;

import com.internyay.entity.Case;
import com.internyay.entity.MiscApplication;
import com.internyay.util.CaseStatuses;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

// A misc. application as the frontend sees it, with the case it is filed in and its documents
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MiscApplicationDto {

    public static final String ROLE_APPLICATION = "APPLICATION";
    public static final String ROLE_ORDER = "ORDER";
    public static final String ROLE_ADDITIONAL = "ADDITIONAL";

    public Long id;

    // The case, read from the case so a changed case title shows here too
    public Long caseId;
    public String caseTitle;
    public String caseNo;
    public String court;
    public String district;
    public String courtNo;
    public String caseStatus;
    public Long clientId;
    public String clientName;

    // True when the case was created together with the application (its details can be edited from the application)
    public boolean caseCreatedHere;
    public String cnrNo;
    public boolean portalSynced;
    public Long linkedCaseId;
    public String linkedCaseTitle;
    public String linkedCaseNo;
    public Integer causeListNo;
    public String listingDate;
    public String applicationType;

    // Dates as yyyy-MM-dd
    public String filingDate;
    public String hearingDate;

    // Pending or Disposed Off, and the day it was disposed off
    public String status;
    public String disposedOn;

    // Allowed or Disallowed once disposed off
    public String disposalOutcome;

    public String createdAt;

    // The application file, its order (only once disposed off) and the other documents
    public DocumentDto applicationDocument;
    public DocumentDto orderDocument;
    @Builder.Default
    public List<DocumentDto> additionalDocuments = new ArrayList<>();

    // The dates the application was listed for, newest first
    @Builder.Default
    public List<MiscHearingDto> hearings = new ArrayList<>();

    // Needs the application's case and client to be loaded already (the repository queries do that)
    public static MiscApplicationDto from(MiscApplication a, List<DocumentDto> docs) {
        return from(a, docs, List.of());
    }

    public static MiscApplicationDto from(MiscApplication a, List<DocumentDto> docs, List<MiscHearingDto> hearings) {
        Case c = a.getLegalCase();
        boolean portal = a.isPortalSynced();
        java.time.LocalDate next = portal ? c.getNextHearing() : a.getHearingDate();
        boolean closed = portal && CaseStatuses.isClosed(c.getStatus());

        MiscApplicationDto dto = MiscApplicationDto.builder()
                .id(a.getId())
                .caseId(c.getId())
                .caseTitle(c.getTitle())
                .caseNo(c.getCaseNo())
                .court(c.getCourt())
                .district(c.getDistrict())
                .courtNo(c.getCourtNo())
                .caseStatus(c.getStatus())
                .clientId(c.getClient() == null ? null : c.getClient().getId())
                .clientName(c.getClient() == null ? null : c.getClient().getName())
                .caseCreatedHere(a.isCaseCreatedHere())
                .cnrNo(c.getCnrNo())
                .portalSynced(portal)
                .causeListNo(portal ? c.getCauseListNo() : null)
                .listingDate(portal && c.getListingDate() != null ? c.getListingDate().toString() : null)
                .applicationType(a.getApplicationType())
                .filingDate(a.getFilingDate() == null ? null : a.getFilingDate().toString())
                .hearingDate(next == null ? null : next.toString())
                .status(portal ? (closed ? MiscApplication.DISPOSED_OFF : MiscApplication.PENDING) : a.getStatus())
                .disposedOn(portal
                        ? (closed && c.getDecisionDate() != null ? c.getDecisionDate().toString() : null)
                        : (a.getDisposedOn() == null ? null : a.getDisposedOn().toString()))
                .disposalOutcome(a.getDisposalOutcome())
                .createdAt(a.getCreatedAt() == null ? null : a.getCreatedAt().toString())
                .build();

        if (hearings != null) dto.hearings.addAll(hearings);

        for (DocumentDto d : docs == null ? List.<DocumentDto>of() : docs) {
            if (ROLE_APPLICATION.equals(d.miscRole)) dto.applicationDocument = d;
            else if (ROLE_ORDER.equals(d.miscRole)) dto.orderDocument = d;
            else dto.additionalDocuments.add(d);
        }
        return dto;
    }
}
