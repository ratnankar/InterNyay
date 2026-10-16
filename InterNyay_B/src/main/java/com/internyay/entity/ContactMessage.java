package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// A message from the landing page contact form or from a logged in user
@Entity
@Table(name = "contact_messages")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ContactMessage {

    // Message statuses, VISITOR is the role of someone who is not logged in
    public static final String NEW = "NEW";
    public static final String READ = "READ";
    public static final String RESOLVED = "RESOLVED";

    public static final String VISITOR = "VISITOR";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // User who sent it, empty for visitors
    private Long accountId;

    private String role;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String email;

    private String phone;

    // Topic chosen in the form
    @Column(nullable = false)
    private String category;

    @Column(nullable = false, length = 200)
    private String subject;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    // NEW, READ or RESOLVED
    @Builder.Default
    @Column(nullable = false)
    private String status = NEW;

    // True when the admin replied and the user has not seen it
    @Builder.Default
    private Boolean userUnread = false;

    // Created and updated times
    @Builder.Default
    @Column(updatable = false, nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime updatedAt;

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
