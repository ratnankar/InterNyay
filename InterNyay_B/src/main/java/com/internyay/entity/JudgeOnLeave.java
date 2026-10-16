package com.internyay.entity;

import java.time.LocalDateTime;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

// A judge on leave for a period, collected by the scraper or added by the admin
@Entity
@Table(name = "judges_on_leave")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JudgeOnLeave {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String court;

    @Column(nullable = false)
    private String district;

    // Leave period
    @Column(nullable = false)
    private LocalDate leaveFrom;

    @Column(nullable = false)
    private LocalDate leaveTo;

    private String reason;

    // Where the record came from
    public static final String SOURCE_SCRAPED = "SCRAPED";
    public static final String SOURCE_MANUAL  = "MANUAL";

    // SCRAPED from the court website or MANUAL from the admin
    @Builder.Default
    @Column(length = 20)
    private String source = SOURCE_SCRAPED;

    // Admin can hide a record from the users
    @Builder.Default
    @Column(name = "hidden_by_admin", nullable = false, columnDefinition = "bit(1) default 0")
    private boolean hiddenByAdmin = false;

    // Created, updated and last scraped times
    @Builder.Default
    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime updatedAt;

    private LocalDateTime lastScrapedAt;

    // True for records added by the admin
    public boolean isManual() {
        return SOURCE_MANUAL.equalsIgnoreCase(source);
    }
}
