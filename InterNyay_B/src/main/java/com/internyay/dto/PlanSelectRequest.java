package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Data @NoArgsConstructor @AllArgsConstructor
public class PlanSelectRequest {
    @NotBlank private String code;
    private String period;
}
