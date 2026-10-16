package com.internyay.dto;

import com.internyay.entity.Case;
import com.internyay.entity.JudgeOnLeave;
import lombok.*;

import java.time.LocalDate;

// Tells whether the judge of a case is sitting or on leave on the hearing date
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HearingLeaveDto {

    private Long caseId;
    private String caseTitle;
    private String court;
    private String courtNo;
    private LocalDate hearingDate;

    private String judgeName;
    // True when the judge is on leave that day
    private boolean onLeave;
    private LocalDate leaveFrom;
    private LocalDate leaveTo;
    private String reason;
    // Serial number on the cause list
    private Integer causeListNo;

    // Common fields of all three cases below
    private static HearingLeaveDtoBuilder base(Case c, LocalDate hearingDate, Integer causeListNo) {
        return HearingLeaveDto.builder()
                .caseId(c.getId())
                .caseTitle(c.getTitle())
                .court(c.getCourt())
                .courtNo(c.getCourtNo())
                .hearingDate(hearingDate)
                .causeListNo(causeListNo);
    }

    // Judge is sitting
    public static HearingLeaveDto sitting(Case c, LocalDate hearingDate, String judgeName, Integer causeListNo) {
        return base(c, hearingDate, causeListNo)
                .judgeName(judgeName)
                .onLeave(false)
                .build();
    }

    // Judge is on leave
    public static HearingLeaveDto onLeave(Case c, LocalDate hearingDate, String judgeName,
                                          JudgeOnLeave leave, Integer causeListNo) {
        return base(c, hearingDate, causeListNo)
                .judgeName(judgeName)
                .onLeave(true)
                .leaveFrom(leave.getLeaveFrom())
                .leaveTo(leave.getLeaveTo())
                .reason(leave.getReason())
                .build();
    }

    // Judge is not known, only the cause list number is shown
    public static HearingLeaveDto listingOnly(Case c, LocalDate hearingDate, Integer causeListNo) {
        return base(c, hearingDate, causeListNo)
                .onLeave(false)
                .build();
    }
}
