package com.internyay.dto;
import jakarta.validation.constraints.*;
import lombok.Data;
// Checks the OTP sent during registration
@Data
public class VerifyOtpRequest {
    @Email(message = "Enter a valid email address") @NotBlank public String email;

    @NotBlank
    @Pattern(regexp = "^\\d{6}$", message = "Enter the 6-digit code")
    public String otp;
}
