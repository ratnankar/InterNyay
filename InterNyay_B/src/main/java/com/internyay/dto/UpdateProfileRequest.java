package com.internyay.dto;

import jakarta.validation.constraints.Pattern;
import lombok.*;

// Profile changes sent from the Profile page
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class UpdateProfileRequest {
    private String name;

    // Indian mobile number, with or without +91, can be empty
    @Pattern(
            regexp = "^$|^(\\+91[\\s-]?|0)?[6-9]\\d{9}$",
            message = "Enter a valid 10-digit Indian mobile number (optionally with +91)"
    )
    private String phone;

    private String barNo;
    private String specialization;
    private String chamber;
    private String profilePicture;

    private String upiId;
    // Payment QR code as base64 text
    private String qrImage;

    // New password, the old one is needed to change it
    private String password;

    private String oldPassword;
}
