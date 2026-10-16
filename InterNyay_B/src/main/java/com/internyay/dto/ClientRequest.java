package com.internyay.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

// Body to create or update a client
@Data
public class ClientRequest {

    // Validation group, name is required only when creating (email is optional)
    public interface Create {}

    @NotBlank(groups = Create.class)
    public String name;

    // Optional, but must be a valid address when given
    @Email
    public String email;

    // Indian mobile number, with or without +91, can be empty
    @Pattern(
        regexp = "^$|^(\\+91[\\s-]?|0)?[6-9]\\d{9}$",
        message = "Enter a valid 10-digit Indian mobile number (optionally with +91)"
    )
    public String whatsappPhone;

    // Same rule for the second number
    @Pattern(
        regexp = "^$|^(\\+91[\\s-]?|0)?[6-9]\\d{9}$",
        message = "Enter a valid 10-digit Indian mobile number (optionally with +91)"
    )
    public String additionalPhone;

    public String address;
    public String profilePicture;
    // Client type text, checked in the service
    public String type;
    public String customLabel;
}
