package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

// Duty magistrate roster row. Judge details are copied in from the Judges List
@Entity
@Table(name = "duty_magistrate_roster")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DutyMagistrate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Judge this row was created from
    private Long judgeId;

    @Column(nullable = false)
    private String court;

    @Column(nullable = false)
    private String district;

    // Judge details copied at the time of saving
    private String courtRoomNo;

    @Column(nullable = false)
    private String judgeName;

    private String designation;

    // Day the magistrate sits and the holiday duty
    @Column(columnDefinition = "TEXT")
    private String workingDay;

    @Column(columnDefinition = "TEXT")
    private String holiday;

    private LocalDate issuedOn;

    // Period of the duty
    private LocalDate fromDate;
    private LocalDate tillDate;

    // True when the duty runs until a further order
    private Boolean furtherOrder;

    // Created and updated times
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }

    // Copies the judge details onto this row
    public void applyJudge(Judge judge) {
        this.judgeId = judge.getId();
        this.judgeName = judge.getName();
        this.designation = judge.getDesignation();
        this.courtRoomNo = judge.getCourtRoomNo();
        this.court = judge.getCourt();
        this.district = judge.getDistrict();
    }
}
