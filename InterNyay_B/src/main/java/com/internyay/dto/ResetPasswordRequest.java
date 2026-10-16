package com.internyay.dto;
import jakarta.validation.constraints.*;
import lombok.Data;

// Sets a new password using the OTP sent by email
@Data
public class ResetPasswordRequest {
    @Email(message = "Enter a valid email address") @NotBlank public String email;

    public String accountType;

    @NotBlank
    @Pattern(regexp = "^\\d{6}$", message = "Enter the 6-digit code")
    public String otp;

    @NotBlank
    public String newPassword;

    @NotBlank
    public String confirmPassword;
}
