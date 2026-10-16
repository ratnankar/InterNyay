package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// OTP sent for forgot password, one pending request per email and role
@Entity
@Table(name = "password_reset_otps",
       uniqueConstraints = @UniqueConstraint(name = "uk_password_reset_otps_email_role",
                                              columnNames = {"email", "role"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PasswordResetOtp {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false)
    private String role;

    // OTP is saved as a hash, never as plain text
    @Column(nullable = false)
    private String codeHash;

    // OTP is valid until this time
    @Column(nullable = false)
    private LocalDateTime expiresAt;

    // Wrong tries so far, limited in application.properties
    @Builder.Default
    @Column(nullable = false)
    private Integer attempts = 0;

    // Used for the resend cooldown
    @Column(nullable = false)
    private LocalDateTime lastSentAt;

    @Builder.Default
    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
