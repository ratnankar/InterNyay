package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

// Asks the user to type their password before a sensitive action
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class PasswordConfirmRequest {

    @NotBlank(message = "Password is required")
    private String password;
}
