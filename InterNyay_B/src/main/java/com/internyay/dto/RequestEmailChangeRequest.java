package com.internyay.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

// Asks to change the email, password is checked before the OTP is sent
@Data
public class RequestEmailChangeRequest {

    @Email(message = "Enter a valid email address") @NotBlank
    public String newEmail;

    @NotBlank
    public String password;
}
