package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// OTP sent to the new address when a user changes their email, one pending request per user
@Entity
@Table(name = "email_change_otps")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class EmailChangeOtp {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private Long accountId;

    // Email the user wants to switch to
    @Column(nullable = false)
    private String newEmail;

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
