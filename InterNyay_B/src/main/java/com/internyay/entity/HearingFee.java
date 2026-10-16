package com.internyay.entity;

import java.time.LocalDateTime;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

// Fee charged for one hearing, used for the DATEWISE fee type
@Entity
@Table(name = "case_hearing_fees")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HearingFee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDate date;

    // Amount charged
    @Column(precision = 12, scale = 2)
    private BigDecimal amount;

    // Amount received so far
    @Column(precision = 12, scale = 2)
    private BigDecimal amountReceived;

    // Paid flag and the time it was marked paid
    @Builder.Default
    private boolean paid = false;

    private LocalDateTime paidAt;

    // Case this fee belongs to
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "case_id", nullable = false)
    private Case legalCase;
}
