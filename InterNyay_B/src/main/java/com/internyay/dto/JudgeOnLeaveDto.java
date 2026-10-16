package com.internyay.dto;

import com.internyay.entity.JudgeOnLeave;
import lombok.*;

import java.time.LocalDate;

// Judge on leave as shown to the users
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JudgeOnLeaveDto {

    private Long id;
    private String name;
    private String court;
    private String district;
    private LocalDate leaveFrom;
    private LocalDate leaveTo;
    private String reason;
    // Photo from the Judges List as base64 text, empty when the judge isn't listed or has no photo
    private String photo;

    // Builds the DTO from the entity
    public static JudgeOnLeaveDto from(JudgeOnLeave judge) {

        return JudgeOnLeaveDto.builder()
                .id(judge.getId())
                .name(judge.getName())
                .court(judge.getCourt())
                .district(judge.getDistrict())
                .leaveFrom(judge.getLeaveFrom())
                .leaveTo(judge.getLeaveTo())
                .reason(judge.getReason())
                .build();
    }
}
