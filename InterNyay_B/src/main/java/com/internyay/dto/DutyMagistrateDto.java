package com.internyay.dto;

import com.internyay.entity.DutyMagistrate;
import lombok.*;

import java.time.LocalDate;

// Duty magistrate row with the judge details copied in
@Getter @Builder
public class DutyMagistrateDto {

    private Long id;

    private Long judgeId;
    private String court;
    private String district;
    private String courtRoomNo;
    private String judgeName;
    private String designation;

    // Day the magistrate sits and the holiday duty
    private String workingDay;
    private String holiday;

    private LocalDate issuedOn;
    private LocalDate fromDate;
    private LocalDate tillDate;
    // True when the duty runs until a further order
    private boolean furtherOrder;

    // Builds the DTO from the entity
    public static DutyMagistrateDto from(DutyMagistrate d) {
        return DutyMagistrateDto.builder()
                .id(d.getId())
                .judgeId(d.getJudgeId())
                .court(d.getCourt())
                .district(d.getDistrict())
                .courtRoomNo(d.getCourtRoomNo())
                .judgeName(d.getJudgeName())
                .designation(d.getDesignation())
                .workingDay(d.getWorkingDay())
                .holiday(d.getHoliday())
                .issuedOn(d.getIssuedOn())
                .fromDate(d.getFromDate())
                .tillDate(d.getTillDate())
                .furtherOrder(Boolean.TRUE.equals(d.getFurtherOrder()))
                .build();
    }
}
