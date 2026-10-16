package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

// Details of an uploaded document, saved in MySQL. The file itself is in file storage (disk or S3 bucket)
@Entity
@Table(name = "documents", indexes = {
        @Index(name = "idx_documents_user", columnList = "user_id"),
        @Index(name = "idx_documents_case", columnList = "case_id"),
        @Index(name = "idx_documents_client", columnList = "client_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocumentMeta {

    // Random UUID text, so ids can't be guessed and the frontend keeps getting a string id
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(length = 36)
    private String id;

    @Column(nullable = false, length = 512)
    private String name;

    @Column(length = 255)
    private String type;

    @Column(name = "file_name", length = 512)
    private String fileName;

    @Column(name = "mime_type", length = 255)
    private String mimeType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    // Where the file is kept in file storage
    @Column(name = "storage_key", nullable = false, length = 255)
    private String storageKey;

    // Case or client the document is attached to, both empty for general documents
    @Column(name = "case_id")
    private Long caseId;

    @Column(name = "client_id")
    private Long clientId;

    // Serial number of an order document inside a case
    @Column(name = "order_seq")
    private Integer orderSeq;

    // Hearing date the order belongs to (shown as "Order - 14 Aug 2026")
    @Column(name = "order_date")
    private LocalDate orderDate;

    // Advocate who owns the document
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "uploaded_at")
    private LocalDateTime uploadedAt;
}
