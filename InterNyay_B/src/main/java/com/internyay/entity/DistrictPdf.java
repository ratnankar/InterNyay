package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// PDF uploaded for a district under a Quick Access section, one per section and district
@Entity
@Table(name = "district_pdfs",
        uniqueConstraints = @UniqueConstraint(columnNames = {"section", "district"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DistrictPdf {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Quick Access section the PDF belongs to
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private RosterSection section;

    @Column(nullable = false)
    private String court;

    @Column(nullable = false)
    private String district;

    // File name and size shown in the admin screen
    private String pdfFileName;
    private Long pdfSizeBytes;
    // Where the PDF is kept in file storage (disk or S3 bucket)
    private String pdfStorageKey;

    // Created and updated times
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
