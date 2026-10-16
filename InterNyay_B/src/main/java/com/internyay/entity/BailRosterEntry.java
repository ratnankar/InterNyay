package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

// Bail roster row for a court and district, maintained by the admin
@Entity
@Table(name = "bail_roster_records")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BailRosterEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String court;

    @Column(nullable = false)
    private String district;

    // Names of the judicial officers on the roster
    @Column(nullable = false, columnDefinition = "TEXT")
    private String judicialOfficers;

    // Ids of the judges linked to those names
    @Column(columnDefinition = "TEXT")
    private String judicialOfficerIds;

    // Police stations or agencies covered
    @Column(columnDefinition = "TEXT")
    private String policeStationAgencies;

    // Judges linked for the quick links
    private Long linkOneJudgeId;

    private Long linkTwoJudgeId;

    private LocalDate issuedOn;

    // Period the roster applies to
    private LocalDate fromDate;
    private LocalDate tillDate;

    // True when the roster runs until a further order
    private Boolean furtherOrder;

    // Created and updated times
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }

}
