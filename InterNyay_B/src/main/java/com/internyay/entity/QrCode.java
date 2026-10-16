package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// Payment QR code image of a user. Small image kept as base64 text in its own table,
// so it is not loaded with every user row
@Entity
@Table(name = "qr_codes", indexes = @Index(name = "idx_qr_codes_user", columnList = "user_id"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class QrCode {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(length = 36)
    private String id;

    @Column(name = "user_id")
    private Long userId;

    // Image saved as base64 text (data URL)
    @Lob
    private String image;

    @Builder.Default
    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
}
