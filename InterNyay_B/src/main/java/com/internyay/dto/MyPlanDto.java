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
    // Corporate firms only: true while the firm has no usable plan, so the app stays locked
    public boolean accessBlocked;
    // NO_PLAN (no plan assigned yet) or PLAN_UNAVAILABLE (the plan is disabled, coming soon or gone); null when not blocked
    public String blockReason;
}
