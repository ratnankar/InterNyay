package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

// An office expense of an advocate, can be submitted by an associate
@Entity
@Table(name = "office_expenses")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OfficeExpense {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Advocate who has to pay it
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // Person who added the expense
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "submitted_by_id", nullable = false)
    private User submittedBy;

    @Column(nullable = false, length = 255)
    private String description;

    // Amount to be paid
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    // UPI id and QR code of the person to be paid
    private String upiId;

    private String qrCodeId;

    // Paid flag and the time it was marked paid
    @Builder.Default
    @Column(nullable = false)
    private boolean paid = false;

    private LocalDateTime paidAt;

    // Created and updated times
    @Builder.Default
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime updatedAt;

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
