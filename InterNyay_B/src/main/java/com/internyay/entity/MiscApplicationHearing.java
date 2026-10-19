package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

// One date a misc. application was listed for. Together they are the application's own hearing history
@Entity
@Table(name = "misc_application_hearings", indexes = {
        @Index(name = "idx_misc_app_hearing_date", columnList = "hearing_date")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MiscApplicationHearing {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "misc_application_id", nullable = false)
    private Long miscApplicationId;

    @Column(name = "hearing_date", nullable = false)
    private LocalDate hearingDate;

    // What happened at this hearing, entered when the next date was set
    @Column(length = 2000)
    private String note;

    @Column(updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
