package com.internyay.dto;

import jakarta.validation.constraints.Pattern;
import lombok.*;

// Used by the admin to create or edit a user
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class AdminUserRequest {
    private String name;
    private String email;
    private String password;

    // Indian mobile number, with or without +91, can be empty
    @Pattern(
        regexp = "^$|^(\\+91[\\s-]?|0)?[6-9]\\d{9}$",
        message = "Enter a valid 10-digit Indian mobile number (optionally with +91)"
    )
    private String phone;

    private String barNo;
    private String specialization;
    private String chamber;
    // Plan to give the user
    private String planCode;
    // ADVOCATE, ASSOCIATE or ADMIN
    private String role;
    // False deactivates the account
    private Boolean active;
    // Associates this advocate may add: -1 = unlimited, 0 or more = that many. Leave out to keep the current value
    private Integer associateLimit;
    // True removes the admin's limit so the plan's limit applies again
    private Boolean clearAssociateLimit;
    // The acting admin's own password, required when this edit makes an advocate an administrator
    private String adminPassword;
}
