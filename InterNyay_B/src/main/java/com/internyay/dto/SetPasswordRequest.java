package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

// First password for an account that signed up with Google (no code needed, the user is already signed in)
@Data
public class SetPasswordRequest {

    @NotBlank(message = "Password is required")
    public String password;

    @NotBlank(message = "Confirm your password")
    public String confirmPassword;
}
