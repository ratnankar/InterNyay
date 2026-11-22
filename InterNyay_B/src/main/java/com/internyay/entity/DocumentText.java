package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "document_text")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class DocumentText {

    @Id
    @Column(name = "document_id", length = 36)
    private String documentId;

    @Column(name = "text_content", nullable = false, columnDefinition = "LONGTEXT")
    private String text;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
