package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

// A date the user has marked as having no hearing, one row per user and date
@Entity
@Table(name = "no_hearing_dates",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "blocked_date"}))
@Getter @Setter @NoArgsConstructor
public class NoHearingDate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "blocked_date", nullable = false)
    private LocalDate blockedDate;

    // Shortcut to create a row
    public NoHearingDate(Long userId, LocalDate blockedDate) {
        this.userId = userId;
        this.blockedDate = blockedDate;
    }
}
