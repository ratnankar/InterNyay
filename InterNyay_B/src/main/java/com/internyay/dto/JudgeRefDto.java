package com.internyay.dto;

import com.internyay.entity.Judge;
import lombok.*;

// Short judge info used inside other DTOs
@Getter @Builder
public class JudgeRefDto {

    private Long id;
    private String name;
    private String designation;
    private String court;
    private String district;
    private String courtRoomNo;
    private String virtualCourtLink;

    // Returns null when the judge was deleted
    public static JudgeRefDto from(Judge j) {
        if (j == null) return null;
        return JudgeRefDto.builder()
                .id(j.getId())
                .name(j.getName())
                .designation(j.getDesignation())
                .court(j.getCourt())
                .district(j.getDistrict())
                .courtRoomNo(j.getCourtRoomNo())
                .virtualCourtLink(j.getVirtualCourtLink())
                .build();
    }
}
