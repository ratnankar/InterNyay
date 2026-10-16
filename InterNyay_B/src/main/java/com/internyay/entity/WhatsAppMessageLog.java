package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

// Record of every WhatsApp message tried, used to avoid duplicates and to show history
@Entity
@Table(name = "whatsapp_message_log")
@Getter @Setter @NoArgsConstructor
public class WhatsAppMessageLog {

    // Type of message, who triggered it and how it ended
    public enum Kind   { HEARING_REMINDER, PAYMENT_DUE }
    public enum Origin { AUTO, MANUAL }

    public enum Status { SENT, DRY_RUN, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;
    private Long caseId;
    private Long clientId;

    // Number the message was sent to
    private String phone;

    @Enumerated(EnumType.STRING)
    private Kind kind;

    @Enumerated(EnumType.STRING)
    private Origin origin;

    @Enumerated(EnumType.STRING)
    private Status status;

    // Hearing the reminder was for
    private LocalDate hearingDate;

    // Error text when the status is FAILED
    @Column(length = 500)
    private String error;

    private LocalDateTime createdAt = LocalDateTime.now();
}
