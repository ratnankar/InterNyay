package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// OTP sent to verify an email during registration, one pending request per email
@Entity
@Table(name = "registration_otps")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RegistrationOtp {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    // OTP is saved as a hash, never as plain text
    @Column(nullable = false)
    private String codeHash;

    // OTP is valid until this time
    @Column(nullable = false)
    private LocalDateTime expiresAt;

    // Set once the user enters the correct OTP, registration is allowed after that
    @Builder.Default
    @Column(nullable = false)
    private Boolean verified = false;

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
