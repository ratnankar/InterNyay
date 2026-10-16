package com.internyay.dto;

import com.internyay.entity.Hearing;
import com.internyay.util.OrderCutoff;
import lombok.*;

import java.time.LocalDate;

// Hearing details sent to the frontend
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class HearingDto {

    public Long id;
    public Long caseId;
    public LocalDate date;
    public String time;
    public String notes;
    public String outcome;

    // Order document linked to the hearing
    public String orderDocId;
    public String orderDocName;
    public Integer orderSeq;

    public boolean orderOnEcourts;
    public boolean orderDue;
    public boolean noOrderOnRecord;

    public String judgeName;

    // True when orders are not declared for this hearing's court or case type, so none can be fetched from eCourts
    public boolean ordersNotDeclared;
    public String ordersNotDeclaredReason;

    // Case info copied in so lists need no extra call
    public String caseTitle;
    public String caseNo;

    // Builds the DTO from the entity
    public static HearingDto from(Hearing h) {
        return HearingDto.builder()
                .id(h.getId())
                .date(h.getDate())
                .time(h.getTime())
                .notes(h.getNotes())
                .outcome(h.getOutcome())
                .orderDocId(h.getOrderDocId())
                .orderDocName(h.getOrderDocName())
                .orderSeq(h.getOrderSeq())
                .orderOnEcourts(h.getOrderDocId() == null
                        && h.getEcourtsOrderFile() != null && !h.getEcourtsOrderFile().isBlank())
                .orderDue(OrderCutoff.passed(h.getDate()))
                .noOrderOnRecord(h.getOrderDocId() == null && Boolean.TRUE.equals(h.getNoOrderOnRecord()))
                .judgeName(h.getJudgeName())
                .caseId(h.getLegalCase().getId())
                .caseTitle(h.getLegalCase().getTitle())
                .caseNo(h.getLegalCase().getCaseNo())
                .build();
    }
}
