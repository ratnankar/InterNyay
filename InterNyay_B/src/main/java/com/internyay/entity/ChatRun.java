package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "chat_runs")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ChatRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long accountId;

    private Long conversationId;

    @Column(length = 300)
    private String question;

    @Column(length = 400)
    private String tools;

    @Column(nullable = false)
    private int rounds;

    @Column(nullable = false)
    private long latencyMs;

    private Integer promptTokens;

    private Integer completionTokens;

    @Column(nullable = false, length = 30)
    private String outcome;

    @Builder.Default
    @Column(updatable = false, nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
