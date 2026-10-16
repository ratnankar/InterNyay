package com.internyay.dto;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

// Login with a Google token
@Data
public class GoogleLoginRequest {

    @NotBlank(message = "Google sign-in token is missing")
    // ID token given by Google on the frontend
    public String idToken;

    public String accountType;
}
