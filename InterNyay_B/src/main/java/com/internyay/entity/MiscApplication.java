package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

// A miscellaneous application filed in a case (bail or any other application). It has its own status, next hearing date
// and documents (the application, its order once disposed off, and any additional documents)
@Entity
@Table(name = "misc_applications", indexes = {
        @Index(name = "idx_misc_apps_user_status", columnList = "user_id, status"),
        @Index(name = "idx_misc_apps_case", columnList = "case_id"),
        @Index(name = "idx_misc_apps_hearing", columnList = "hearing_date")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MiscApplication {

    public static final String PENDING = "Pending";
    public static final String DISPOSED_OFF = "Disposed Off";

    // How a disposed off application ended
    public static final String ALLOWED = "Allowed";
    public static final String DISALLOWED = "Disallowed";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Case the application is filed in
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "case_id", nullable = false)
    private Case legalCase;

    // Advocate who owns it
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // Picked from the document types or typed by the advocate, e.g. "Bail Application"
    @Column(name = "application_type", nullable = false)
    private String applicationType;

    private LocalDate filingDate;

    // Next date the application is listed for
    private LocalDate hearingDate;

    // Pending or Disposed Off
    @Column(nullable = false, length = 30)
    @Builder.Default
    private String status = PENDING;

    private LocalDate disposedOn;

    // Allowed or Disallowed, set when the application is disposed off
    @Column(length = 20)
    private String disposalOutcome;

    @Column(updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }

    public boolean isDisposedOff() { return DISPOSED_OFF.equals(status); }
}
