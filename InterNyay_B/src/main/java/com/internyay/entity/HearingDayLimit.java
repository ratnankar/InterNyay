package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

// A limit (1 or more) on the hearings of one date, it replaces the user's usual daily limit for that date. One row per user and date.
// A limit of 0 is not stored: it is a no-hearing date (see NoHearingDate)
@Entity
@Table(name = "hearing_day_limits",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "limit_date"}))
@Getter @Setter @NoArgsConstructor
public class HearingDayLimit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "limit_date", nullable = false)
    private LocalDate limitDate;

    @Column(name = "max_hearings", nullable = false)
    private Integer maxHearings;

    // Shortcut to create a row
    public HearingDayLimit(Long userId, LocalDate limitDate, Integer maxHearings) {
        this.userId = userId;
        this.limitDate = limitDate;
        this.maxHearings = maxHearings;
    }
}
