package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// A legal form uploaded by the admin. Details are in MySQL, the PDF is in file storage
@Entity
@Table(name = "legal_forms")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class LegalForm {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    // Short description shown in the list
    @Lob
    private String description;

    // Positions of the fields to fill, saved as JSON
    @Lob
    private String fieldConfig;

    // True when users can fill it in the app
    private Boolean fillable;

    // Number of fillable fields
    private Integer fieldCount;

    // Order in which it is shown
    private Integer sortOrder;

    // Details of the uploaded file
    private String fileName;
    private String mimeType;
    private long sizeBytes;

    // Where the PDF is kept in file storage (disk or S3 bucket)
    @Column(name = "storage_key", nullable = false, length = 255)
    private String storageKey;

    // Upload and update times
    @Builder.Default
    @Column(updatable = false)
    private LocalDateTime uploadedAt = LocalDateTime.now();

    private LocalDateTime updatedAt;

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
