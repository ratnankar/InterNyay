package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

// Used by the admin to add or edit a judge: name and photo only
@Data
public class JudgeProfileRequest {

    @NotBlank(message = "Name is required")
    private String name;

    // Photo as base64 text. Left out = keep the saved photo, blank = remove it
    private String photo;
}
