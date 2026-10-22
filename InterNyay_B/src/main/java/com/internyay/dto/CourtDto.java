package com.internyay.dto;

import com.internyay.entity.Court;

// A row of the court table, empty text means "none"
public record CourtDto(Long id, String court, String district, String building, String floor, String courtNo, boolean highCourt, boolean mahilaCourt, boolean juvenileJusticeBoard) {

    public static CourtDto from(Court c) {
        return new CourtDto(c.getId(), c.getCourt(), c.getDistrict(), c.getBuilding(), c.getFloor(), c.getCourtNo(), c.isHighCourt(), c.isMahilaCourt(), c.isJuvenileJusticeBoard());
    }
}
