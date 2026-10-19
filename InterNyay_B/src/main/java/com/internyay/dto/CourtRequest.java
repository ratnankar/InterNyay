package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

// Admin adds a court, district, building or court no. to the court table
@Data
public class CourtRequest {

    @NotBlank(message = "Court is required")
    private String court;

    // Empty for the High Court and Supreme Court
    private String district;
    private String building;
    private String floor;
    private String courtNo;

    // Only used when a new court is added: true for a court with no districts
    private boolean highCourt;
}
