package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

// One hearing of a case, with notes, outcome and the order document
@Entity
@Table(name = "hearings", indexes = {
        @Index(name = "idx_hearings_case_date", columnList = "case_id, date"),
        @Index(name = "idx_hearings_user_date", columnList = "user_id, date")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Hearing {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate date;

    // Time of the hearing as text
    private String time;

    @Column(columnDefinition = "TEXT")
    private String notes;

    // What happened in the hearing
    private String outcome;

    // Id of the order document of this hearing (see DocumentMeta)
    private String orderDocId;

    private String orderDocName;

    // Serial number of the order inside the case: orders are counted oldest hearing date first, and a date
    // with no order takes no number (Order 1, Order 2 even when a date in between had none)
    private Integer orderSeq;

    private Boolean noOrderOnRecord;

    // File name eCourts uses for this hearing's order (e.g. order-4.pdf), read from the case-detail API
    private String ecourtsOrderFile;

    // Judge who heard the matter
    private String judgeName;

    // Case this hearing belongs to
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "case_id", nullable = false)
    private Case legalCase;

    // Advocate who entered it
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // Created and updated times
    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime updatedAt = LocalDateTime.now();

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
