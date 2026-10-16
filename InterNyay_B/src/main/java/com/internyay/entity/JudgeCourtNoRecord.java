package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

@Entity
@Table(name = "judge_court_no_records",
       indexes = @Index(name = "idx_court_no_record_judge", columnList = "judge_id"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class JudgeCourtNoRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "judge_id", nullable = false)
    private Long judgeId;

    @Column(nullable = false)
    private String courtRoomNo;

    @Column(nullable = false)
    private LocalDate fromDate;

    private LocalDate tillDate;

    // Building the court was in during this period, if it has one
    private String building;

    // Court complex and district this court number belonged to during the period
    private String court;

    private String district;

    // Judge who sat in this court during the period. Empty = the listing's current judge
    private String judgeName;

    // Judge profile who sat in this court during the period, so a corrected name shows everywhere
    @Column(name = "profile_id")
    private Long profileId;
}
