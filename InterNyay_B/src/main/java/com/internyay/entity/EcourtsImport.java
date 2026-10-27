package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// The "Import from eCourts" list of one account: the cases of the My Cases file the advocate uploaded,
// kept on the server so the list follows the account to another device
@Entity
@Table(name = "ecourts_imports")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class EcourtsImport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Account (advocate or associate) the list belongs to; nobody else can read it
    @Column(nullable = false, unique = true)
    private Long accountId;

    // JSON array of cases
    @Column(nullable = false, columnDefinition = "MEDIUMTEXT")
    private String data;

    // Epoch milliseconds, set by the app
    @Column(nullable = false)
    private long updatedAt;
}
