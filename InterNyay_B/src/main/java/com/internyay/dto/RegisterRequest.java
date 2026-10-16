package com.internyay.dto;
import jakarta.validation.constraints.*;
import lombok.Data;
// Registration with email and password, the email must be verified by OTP first
@Data
public class RegisterRequest {
    @NotBlank public String name;
    @Email(message = "Enter a valid email address") @NotBlank public String email;
    @NotBlank public String password;

    @NotBlank public String confirmPassword;

    // Indian mobile number, with or without +91, required
    // (the pattern lets an empty value through so a blank phone only reports the "required" message)
    @NotBlank(message = "Phone number is required")
    @Pattern(
            regexp = "^$|^(\\+91[\\s-]?|0)?[6-9]\\d{9}$",
            message = "Enter a valid 10-digit Indian mobile number (optionally with +91)"
    )
    public String phone;

    public String barNo;
    public String specialization;

    // Advocate or associate
    public String accountType;

    // Needed when registering as an associate
    public String advocateCode;
}
