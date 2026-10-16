package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// Reply from the admin to a contact message
@Entity
@Table(name = "contact_replies")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ContactReply {

    // Where a reply goes: email, the account inbox, or both
    public static final String EMAIL = "EMAIL";
    public static final String ACCOUNT = "ACCOUNT";
    public static final String BOTH = "BOTH";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Message this reply belongs to
    @Column(nullable = false)
    private Long messageId;

    @Column(nullable = false)
    private String adminName;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String body;

    // EMAIL, ACCOUNT or BOTH
    @Column(length = 10)
    private String channel;

    // Whether the email was sent successfully
    private Boolean emailed;

    @Builder.Default
    @Column(updatable = false, nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    // Email only replies are not shown inside the account
    public boolean shownToUser() {
        return !EMAIL.equals(channel);
    }
}
