package com.internyay.dto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

// Registration with a Google token plus the extra details Google does not give
@Data
public class GoogleRegisterRequest {

    @NotBlank(message = "Google sign-in token is missing")
    public String idToken;

    public String accountType;

    // Needed when registering as an associate
    public String advocateCode;

    // Indian mobile number, with or without +91. Required for a new account: the service asks for it when it is
    // missing (an existing account signing in through this endpoint does not need one), so it is not @NotBlank here
    @Pattern(
            regexp = "^$|^(\\+91[\\s-]?|0)?[6-9]\\d{9}$",
            message = "Enter a valid 10-digit Indian mobile number (optionally with +91)"
    )
    public String phone;

    public String barNo;
    public String specialization;
}
