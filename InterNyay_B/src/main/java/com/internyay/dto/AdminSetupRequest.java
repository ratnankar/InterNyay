package com.internyay.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

// Body of POST /api/admin/setup
@Data @NoArgsConstructor @AllArgsConstructor
public class AdminSetupRequest {

    // Email of an already registered advocate account
    @NotBlank(message = "Email is required")
    @Email(message = "Enter a valid email")
    private String email;
}
