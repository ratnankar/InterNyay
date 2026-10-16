package com.internyay.dto;
import jakarta.validation.constraints.*;
import lombok.Data;

// Asks for a password reset OTP
@Data
public class ForgotPasswordRequest {
    @Email(message = "Enter a valid email address") @NotBlank public String email;

    // Same email can be an advocate or an associate, so the type is needed
    public String accountType;
}
