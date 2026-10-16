package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

// Used by the admin to add or edit a judge leave
@Data
public class JudgeLeaveRequest {

    @NotBlank @Size(max = 255) private String name;
    @NotBlank @Size(max = 255) private String court;
    @NotBlank @Size(max = 255) private String district;

    @NotNull private LocalDate leaveFrom;
    @NotNull private LocalDate leaveTo;

    @Size(max = 255) private String reason;
}
