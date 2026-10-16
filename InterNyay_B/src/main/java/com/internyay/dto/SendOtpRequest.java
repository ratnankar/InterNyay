package com.internyay.dto;
import jakarta.validation.constraints.*;
import lombok.Data;
// Asks for an OTP to verify an email during registration
@Data
public class SendOtpRequest {
    @Email(message = "Enter a valid email address") @NotBlank public String email;

    public String name;
}
