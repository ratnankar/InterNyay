package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

// Admin asks to move every advocate on one plan to another plan
@Data
public class PlanMigrateRequest {
    // Plan the accounts are on now
    @NotBlank
    private String fromCode;

    // Plan they should be moved to
    @NotBlank
    private String toCode;

    // True only checks who would move, nothing is saved
    private Boolean dryRun;
}
