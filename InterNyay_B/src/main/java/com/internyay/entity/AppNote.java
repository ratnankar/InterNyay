package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// A private note written in the InterNyay Calendar app, kept on the server so it follows the user to a new phone
@Entity
@Table(name = "app_notes")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AppNote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Account (advocate or associate) that owns the note; nobody else can read it
    @Column(nullable = false)
    private Long accountId;

    // Id the app gave the note
    @Column(nullable = false, length = 64)
    private String clientId;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String body;

    // Handwriting, stored as the app produces it
    @Column(columnDefinition = "LONGTEXT")
    private String ink;

    @Column(nullable = false)
    private boolean pinned;

    // Case the note is linked to, a plain number so deleting the case keeps the note
    private Long caseId;

    @Column(length = 500)
    private String caseTitle;

    // Epoch milliseconds, set by the app
    @Column(nullable = false)
    private long createdAt;

    @Column(nullable = false)
    private long updatedAt;

    // Set when the note was deleted; the row stays so the deletion reaches the other devices
    private Long deletedAt;
}
