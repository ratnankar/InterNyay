package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// An MIS spreadsheet (.xlsx) a corporate firm uploaded to allot cases; the CNR numbers read from it are kept as allotments
@Entity
@Table(name = "corporate_sheets")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CorporateSheet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // The corporate firm that uploaded the sheet
    @Column(name = "firm_id", nullable = false)
    private Long firmId;

    @Column(nullable = false)
    private String fileName;

    // Where the file is kept in file storage (disk or S3), like documents
    @Column(nullable = false)
    private String storageKey;

    @Builder.Default
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
