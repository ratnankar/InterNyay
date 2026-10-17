package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// One saved chat of an account with the AI assistant (an account can have many)
@Entity
@Table(name = "chat_conversations")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ChatConversation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Account (advocate or associate) the chat belongs to
    @Column(nullable = false)
    private Long accountId;

    // Shown in the chat list: the first question, shortened
    @Column(nullable = false, length = 120)
    private String title;

    @Builder.Default
    @Column(updatable = false, nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    // Moves forward with every new message, so the chat list shows the latest chat first
    @Builder.Default
    @Column(nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
