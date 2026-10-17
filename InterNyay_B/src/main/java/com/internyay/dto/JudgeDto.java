package com.internyay.dto;

import com.internyay.entity.Judge;
import lombok.*;

import java.util.List;

// Full judge details sent to the frontend
@Getter @Builder(toBuilder = true)
public class JudgeDto {

    // Id of the listing (the court seat)
    private Long id;
    // Id of the judge who holds it (judge profile)
    private Long judgeId;
    private String name;
    private String court;
    private String district;
    // Row of the courts table for this court and district
    private Long courtId;
    private String designation;
    private String courtRoomNo;
    private String building;
    // Photo as base64 text
    private String photo;
    private String vcMeetingId;
    private String courtEmail;
    private String virtualCourtLink;
    private String courtReaderName;
    private String courtReaderPhone;
    private String jurisdiction;
    // True when the judge sits in a Mahila court (orders are not declared there)
    private boolean mahilaCourt;
    // True while the court has no judge (the judge is the special "Vacant" profile)
    private boolean vacant;
    private List<CourtNoRecordDto> courtNoHistory;
    // Courts this judge holds in all (1 for most judges) and the other courts as text
    private int courtCount;
    private List<String> otherCourts;

    // Builds the DTO from the entity
    public static JudgeDto from(Judge j, List<CourtNoRecordDto> courtNoHistory) {
        return JudgeDto.builder()
                .id(j.getId())
                .judgeId(j.getProfile().getId())
                .name(j.getName())
                .court(j.getCourt())
                .district(j.getDistrict())
                .courtId(j.getCourtId())
                .designation(j.getDesignation())
                .courtRoomNo(j.getCourtRoomNo())
                .building(j.getBuilding())
                .photo(j.getPhoto())
                .vcMeetingId(j.getVcMeetingId())
                .courtEmail(j.getCourtEmail())
                .virtualCourtLink(j.getVirtualCourtLink())
                .courtReaderName(j.getCourtReaderName())
                .courtReaderPhone(j.getCourtReaderPhone())
                .jurisdiction(j.getJurisdiction())
                .vacant(j.getProfile().isVacant())
                .courtNoHistory(courtNoHistory)
                .courtCount(1)
                .otherCourts(List.of())
                .build();
    }
}
