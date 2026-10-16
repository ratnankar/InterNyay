package com.internyay.dto;

import lombok.*;

import java.util.List;

// Judges on leave today and the leaves coming up
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JudgeOnLeaveResponse {

    private List<JudgeOnLeaveDto> onLeaveToday;

    private List<JudgeOnLeaveDto> upcoming;

    private List<JudgeOnLeaveDto> past;
}
