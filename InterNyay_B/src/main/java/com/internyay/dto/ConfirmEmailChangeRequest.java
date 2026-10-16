package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

// OTP sent to the new email to confirm the change
@Data
public class ConfirmEmailChangeRequest {

    @NotBlank
    // Must be 6 digits
    @Pattern(regexp = "^\\d{6}$", message = "Enter the 6-digit code")
    public String otp;
}
