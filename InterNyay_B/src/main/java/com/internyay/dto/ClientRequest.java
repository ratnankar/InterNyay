package com.internyay.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
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

    // S/o, D/o, W/o, H/o or C/o and the relative's name
    @Pattern(regexp = "^$|^(S/o|D/o|W/o|H/o|C/o)$", message = "Relation must be S/o, D/o, W/o, H/o or C/o")
    public String relationType;
    @Size(max = 255)
    public String relationName;

    // Other names the client is known by
    public java.util.List<@Size(max = 255) String> otherNames;

    public String profilePicture;
    // Client type text, checked in the service
    public String type;
    public String customLabel;
}
