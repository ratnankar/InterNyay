package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

// A client of an advocate
@Entity
@Table(name = "clients")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Client {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String email;

    // Number used for WhatsApp reminders
    private String whatsapp_phone;
    private String additional_phone;
    private String address;

    // Photo stored as base64 text
    @Column(columnDefinition = "LONGTEXT")
    private String profilePicture;

    // Type of client, individual by default
    @Enumerated(EnumType.STRING)
    private ClientType type = ClientType.INDIVIDUAL;

    // Optional tag like Pro Bono
    @Enumerated(EnumType.STRING)
    private CustomLabel customLabel;

    // Advocate who owns this client
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // Created and updated times
    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime updatedAt;

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }

    // Client types, value is the text shown in the app
    public enum ClientType {

        INDIVIDUAL("INDIVIDUAL"),
        COMPANY("COMPANY"),
        BANK("BANK"),
        FINANCIAL_INSTITUTE("FINANCIAL INSTITUTE"),
        SOCIETY_NGO("SOCIETY/NGO"),
        FOREIGN_CLIENT("FOREIGN CLIENT"),
        HOSPITAL_MEDICAL_INSTITUTE("HOSPITAL/MEDICAL INSTITUTE"),
        ASSOCIATION("ASSOCIATION"),
        OTHER("OTHER");

        private final String value;

        ClientType(String value) {
            this.value = value;
        }

        // Reads the type from the text sent by the frontend
        @JsonCreator
        public static ClientType fromValue(String value) {
            for (ClientType type : ClientType.values()) {
                if (type.value.equalsIgnoreCase(value)) {
                    return type;
                }
            }
            throw new IllegalArgumentException("Invalid ClientType: " + value);
        }

        // Sends the display text back to the frontend
        @JsonValue
        public String getValue() {
            return value;
        }
    }

    // Optional labels for a client
    public enum CustomLabel {

        LEGAL_AID("Legal Aid"),
        PRO_BONO("Pro Bono"),
        CORPORATE_PANEL("Corporate Panel"),
        PRIVATE("Private");

        private final String value;

        CustomLabel(String value) {
            this.value = value;
        }

        // Reads the label from the text sent by the frontend
        @JsonCreator
        public static CustomLabel fromValue(String value) {
            for (CustomLabel type : CustomLabel.values()) {
                if (type.value.equalsIgnoreCase(value)) {
                    return type;
                }
            }
            throw new IllegalArgumentException("CustomLabel: " + value);
        }

        // Sends the display text back to the frontend
        @JsonValue
        public String getValue() {
            return value;
        }
    }
}
