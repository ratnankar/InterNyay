package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// One judge on one bail roster entry. This table is the enforceable version of the comma list in
// bail_roster_records.judicial_officer_ids: both keys are real foreign keys (see src/main/resources/db/migration/V1__create_schema.sql),
// so a deleted judge or roster entry can never leave a dead id behind. The comma list is still kept for the
// display order of the officers.
@Entity
@Table(name = "bail_roster_judges",
        uniqueConstraints = @UniqueConstraint(name = "uk_bail_roster_judge", columnNames = {"roster_id", "judge_id"}),
        indexes = @Index(name = "idx_bail_roster_judges_judge", columnList = "judge_id"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BailRosterJudge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "roster_id", nullable = false)
    private Long rosterId;

    @Column(name = "judge_id", nullable = false)
    private Long judgeId;
}
