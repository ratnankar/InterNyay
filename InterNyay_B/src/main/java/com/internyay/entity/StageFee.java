package com.internyay.entity;

import java.time.LocalDateTime;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

// Fee for one stage of a case, used for the STAGEWISE fee type
@Entity
@Table(name = "case_stage_fees")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StageFee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Name of the stage
    @Column(length = 255)
    private String name;

    @Column(precision = 12, scale = 2)
    private BigDecimal amount;

    // Paid flag and the time it was marked paid
    @Builder.Default
    private boolean paid = false;

    private LocalDateTime paidAt;

    // Case this fee belongs to
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "case_id", nullable = false)
    private Case legalCase;
}
