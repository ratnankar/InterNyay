package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

// Notification published by the admin, can carry a PDF
@Entity
@Table(name = "notifications")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Where the notice came from
    @Column(nullable = false)
    private String source;

    @Column(nullable = false)
    private String title;

    @Lob
    private String message;

    // Date of the notice
    @Column(nullable = false)
    private LocalDate date = LocalDate.now();

    // Attached PDF, the file is in file storage (disk or S3 bucket)
    private String fileName;
    private String mimeType;
    private long sizeBytes;

    // Where the PDF is kept in file storage
    private String storageKey;

    // Important ones pop up for the users until dismissed
    private Boolean important = false;

    // Created and updated times
    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime updatedAt;

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }

    // Null counts as not important
    public boolean isMarkedImportant() {
        return Boolean.TRUE.equals(important);
    }

    // True when a PDF is attached
    public boolean hasPdf() {
        return storageKey != null && !storageKey.isBlank();
    }
}
