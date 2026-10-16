package com.internyay.dto;

import com.internyay.entity.JudgeOnLeave;
import lombok.*;

import java.time.LocalDate;

// Judge leave record for the admin screen, includes hidden ones and the status
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class AdminJudgeLeaveDto {

    private Long id;
    private String name;
    private String court;
    private String district;
    private LocalDate leaveFrom;
    private LocalDate leaveTo;
    private String reason;

    private String source;

    // True when the admin has hidden it from users
    private boolean hidden;

    // PAST, CURRENT or UPCOMING
    private String status;

    // Works out the status of a leave compared to today
    public static String statusOf(JudgeOnLeave j, LocalDate today) {
        if (j.getLeaveTo().isBefore(today))   return "PAST";
        if (j.getLeaveFrom().isAfter(today))  return "UPCOMING";
        return "CURRENT";
    }

    // Builds the DTO from the entity
    public static AdminJudgeLeaveDto from(JudgeOnLeave j, LocalDate today) {
        return AdminJudgeLeaveDto.builder()
                .id(j.getId())
                .name(j.getName())
                .court(j.getCourt())
                .district(j.getDistrict())
                .leaveFrom(j.getLeaveFrom())
                .leaveTo(j.getLeaveTo())
                .reason(j.getReason())
                .source(j.isManual() ? JudgeOnLeave.SOURCE_MANUAL : JudgeOnLeave.SOURCE_SCRAPED)
                .hidden(j.isHiddenByAdmin())
                .status(statusOf(j, today))
                .build();
    }
}
