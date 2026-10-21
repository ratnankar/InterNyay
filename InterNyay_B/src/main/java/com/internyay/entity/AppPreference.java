package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// Preferences of one account in the InterNyay Calendar app (court colours, court filter, view settings),
// kept on the server so they follow the user to a new phone
@Entity
@Table(name = "app_preferences")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AppPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Account (advocate or associate) the preferences belong to; nobody else can read them
    @Column(nullable = false, unique = true)
    private Long accountId;

    // A small JSON object, stored as the app produces it
    @Column(nullable = false, columnDefinition = "TEXT")
    private String data;

    // Epoch milliseconds, set by the app
    @Column(nullable = false)
    private long updatedAt;
}
