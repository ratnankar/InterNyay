package com.internyay.dto;

import com.internyay.entity.JudgeCourtNoRecord;

import java.time.LocalDate;

public record CourtNoRecordDto(Long id, String courtRoomNo, LocalDate fromDate, LocalDate tillDate, boolean current,
                               String building, String floor, String court, String district) {

    public static CourtNoRecordDto from(JudgeCourtNoRecord r) {
        return new CourtNoRecordDto(r.getId(), r.getCourtRoomNo(), r.getFromDate(), r.getTillDate(),
                r.getTillDate() == null, r.getBuilding(), r.getFloor(), r.getCourt(), r.getDistrict());
    }
}
