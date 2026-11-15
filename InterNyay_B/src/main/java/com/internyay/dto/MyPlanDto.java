package com.internyay.dto;

import lombok.*;

import java.util.List;

// Current plan of an advocate and the plans they can switch to
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class MyPlanDto {
    public PlanDto current;
    // Associate seats already used
    public long associatesUsed;
    public List<PlanDto> available;
}
