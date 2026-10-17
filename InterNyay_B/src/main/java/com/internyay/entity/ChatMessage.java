package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// One message of a saved chat with the AI assistant
@Entity
@Table(name = "chat_messages")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ChatMessage {

    public static final String USER = "user";
    public static final String ASSISTANT = "assistant";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Account (advocate or associate) the conversation belongs to
    @Column(nullable = false)
    private Long accountId;

    // The chat this message is part of
    @Column(nullable = false)
    private Long conversationId;

    // user or assistant
    @Column(nullable = false, length = 20)
    private String role;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    // Button shown under an assistant message (for example "contact"), empty for normal messages
    @Column(length = 30)
    private String action;

    @Builder.Default
    @Column(updatable = false, nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
