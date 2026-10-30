package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// A photo, video or PDF attached to a contact message. The file is in file storage, only its key is kept here
@Entity
@Table(name = "contact_attachments")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ContactAttachment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Message this file belongs to
    @Column(nullable = false)
    private Long messageId;

    @Column(nullable = false)
    private String fileName;

    @Column(nullable = false, length = 100)
    private String mimeType;

    @Column(nullable = false)
    private Long sizeBytes;

    @Column(nullable = false)
    private String storageKey;

    @Builder.Default
    @Column(updatable = false, nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
