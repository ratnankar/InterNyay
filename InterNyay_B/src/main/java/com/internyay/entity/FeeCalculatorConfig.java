package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// The court fee calculator rules (filings, fee scales and notes) as one JSON document edited by the admin.
// Only one row is ever kept (id 1). With no row the app uses its built-in Court Fees Act, 1870 defaults.
@Entity
@Table(name = "fee_calculator_config")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class FeeCalculatorConfig {

    public static final long ROW_ID = 1L;

    @Id
    private Long id;

    @Column(nullable = false, columnDefinition = "LONGTEXT")
    private String config;

    private LocalDateTime updatedAt;
}
