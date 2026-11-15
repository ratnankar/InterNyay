package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// A case a corporate account allotted to one of its hired advocates (a CNR number is allotted to one advocate at a time)
@Entity
@Table(name = "corporate_allotments")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CorporateAllotment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "firm_id", nullable = false)
    private Long corporateId;

    // The hired advocate the case went to
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "advocate_id")
    private User advocate;

    // Spreadsheet the CNR number was read from (empty once that sheet is deleted)
    @Column(name = "sheet_id")
    private Long sheetId;

    @Column(name = "cnr_no", nullable = false, length = 16)
    private String cnrNo;

    // What the MIS sheet said about the case when it was allotted (refreshed when a newer sheet is uploaded)
    @Column(name = "cc_no", length = 60)
    private String ccNo;

    @Column(name = "court_name", length = 120)
    private String courtName;

    @Column(name = "accused", length = 255)
    private String accused;

    @Column(name = "next_date")
    private java.time.LocalDate nextDate;

    @Column(name = "case_status", length = 80)
    private String caseStatus;

    // The upload this allotment came from, so one bulk allotment can be told apart from another
    @Column(name = "batch_id", nullable = false, length = 40)
    private String batchId;

    @Builder.Default
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Builder.Default
    @Column(nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
