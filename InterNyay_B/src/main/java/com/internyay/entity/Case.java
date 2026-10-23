package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.SQLRestriction;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// A court case of an advocate, with its fees, client links and next hearing. Deleted cases are hidden by @SQLRestriction
@SQLRestriction("(deleted IS NULL OR deleted = 0)")
@Entity
@Table(name = "cases", uniqueConstraints = {
        @UniqueConstraint(name = "uk_cases_user_case_no", columnNames = {"user_id", "case_no"})
}, indexes = {
        @Index(name = "idx_cases_next_hearing", columnList = "next_hearing"),
        @Index(name = "idx_cases_cnr_no", columnList = "cnr_no"),
        @Index(name = "idx_cases_user_status", columnList = "user_id, status")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Case {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 500)
    private String title;

    // Case number is unique for each advocate (two advocates may hold the same case, e.g. both added it by CNR).
    // Empty only for a case of a Juvenile Justice Board; every other case needs one (checked in CaseService)
    private String caseNo;

    // Advocate's own file number, fileSeq is the number part
    private String fileNo;

    private Integer fileSeq;

    // Soft delete, the row stays and can be restored
    @Builder.Default
    private Boolean deleted = false;

    private LocalDateTime deletedAt;

    // CNR number used to look the case up on eCourts
    private String cnrNo;

    private LocalDate filingDate;

    // Whether our client is the COMPLAINANT or the ACCUSED
    @Column(length = 20)
    private String clientSide;

    // The court table row this case is filed at: a court complex with its district (like Saket / South),
    // or a high court. The case keeps no copy of that text, court and district are read from this row.
    // Loaded together with the case because court and district are needed wherever a case is shown
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "court_id", nullable = false, foreignKey = @ForeignKey(name = "fk_cases_court"))
    private Court courtPlace;

    // Court room number as the advocate has it for this case (it can change from hearing to hearing)
    private String courtNo;

    // Building and floor of that court room, as listed in the court table (null when the table has none)
    private String building;
    private String floor;

    private String caseNature;

    // Relief sought, "Police Challan" is one of the values
    private String reliefSought;

    private String caseType;

    // FIR details for criminal cases
    private String firNo;
    private String firSection;
    private String policeStation;

    // Row of the police stations table when the name above matches exactly one station (null when unknown or ambiguous)
    @Column(name = "police_station_id")
    private Long policeStationId;

    // Cheque bounce (Sec 138 NI Act) details
    @Column(length = 50)
    private String chequeNo;
    private LocalDate chequeDate;
    private LocalDate memoDate;
    private String bouncingReason;
    @Column(precision = 14, scale = 2)
    private BigDecimal claimAmount;
    private LocalDate noticeDate;

    // Case status, Decided, Withdrawn and Closed mean the case is over
    private String status;
    private String description;
    // Date of the next hearing
    private LocalDate nextHearing;

    // Serial number on the cause list, read from the Delhi High Court PDFs or the district cause list relay
    @Column(name = "listing_no")
    private Integer causeListNo;

    private LocalDate listingDate;

    // How the fee is charged: TOTAL, DATEWISE or STAGEWISE
    @Builder.Default
    private String feeType = "TOTAL";

    // Fee for the TOTAL type
    @Column(precision = 12, scale = 2)
    private BigDecimal totalFeeAmount;

    private LocalDate totalFeeAmountDate;

    @Builder.Default
    private boolean totalFeePaid = false;

    // Advance or initial amount
    @Column(precision = 12, scale = 2)
    private BigDecimal initialAmount;

    private LocalDate initialAmountDate;

    @Builder.Default
    private boolean initialPaid = false;

    // Fee for the DATEWISE type, charged per hearing
    @Column(precision = 12, scale = 2)
    private BigDecimal dateWiseAmount;

    // Fee entries added per hearing
    @OneToMany(mappedBy = "legalCase", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<HearingFee> hearingFees = new ArrayList<>();

    // Fee entries for the STAGEWISE type
    @OneToMany(mappedBy = "legalCase", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    @BatchSize(size = 50)
    @Builder.Default
    private List<StageFee> stageFees = new ArrayList<>();

    // Main client of the case. Empty only for a case added by CNR without a client; the advocate can add one later
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "client_id")
    private Client client;

    // Other clients in the same case
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "case_additional_clients",
            joinColumns = @JoinColumn(name = "case_id"),
            inverseJoinColumns = @JoinColumn(name = "client_id"))
    @OrderColumn(name = "position")
    @BatchSize(size = 50)
    @Builder.Default
    private List<Client> additionalClients = new ArrayList<>();

    // Opposite parties, in the order they were entered. A case can have several
    @OneToMany(mappedBy = "legalCase", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    @BatchSize(size = 50)
    @Builder.Default
    private List<CaseOpponent> opponents = new ArrayList<>();

    // People on our side who are not saved as clients, in the order they were entered
    @OneToMany(mappedBy = "legalCase", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    @BatchSize(size = 50)
    @Builder.Default
    private List<CaseNonClient> nonClients = new ArrayList<>();

    // Role of each client in this case, client id -> sub type
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "case_client_sub_types", joinColumns = @JoinColumn(name = "case_id"))
    @MapKeyColumn(name = "client_id")
    @Column(name = "sub_type", length = 40)
    @BatchSize(size = 50)
    @Builder.Default
    private Map<Long, String> clientSubTypes = new HashMap<>();

    // Advocate who owns the case
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // WhatsApp reminders for this case, on when not set
    private Boolean whatsappReminders;

    // Court complex or high court name, read from the linked court table row
    public String getCourt() {
        return courtPlace == null ? null : courtPlace.getCourt();
    }

    // District, read from the linked court table row; null for a high court, which has none
    public String getDistrict() {
        String d = courtPlace == null ? null : courtPlace.getDistrict();
        return d == null || d.isEmpty() ? null : d;
    }

    // The advocate's own choice: on unless they switched it off for this case
    public boolean isWhatsappReminderPreferenceOn() {
        return whatsappReminders == null || whatsappReminders;
    }

    // True when the main client or any additional client has a WhatsApp number saved
    public boolean hasClientWhatsappNumber() {
        if (client != null && hasText(client.getWhatsapp_phone())) return true;
        if (additionalClients != null) {
            for (Client cl : additionalClients) {
                if (cl != null && hasText(cl.getWhatsapp_phone())) return true;
            }
        }
        return false;
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    // Automatic reminders really run only when the advocate hasn't switched them off and
    // at least one client has a number. Nothing is stored for "no number", so adding a
    // number later turns the reminders on by itself
    public boolean isWhatsappRemindersEnabled() {
        return isWhatsappReminderPreferenceOn() && hasClientWhatsappNumber();
    }

    // How many days before the hearing to remind, 1 or 2
    private Integer reminderDaysBefore;

    // Anything other than 2 days is treated as 1 day
    public int getReminderDaysBeforeOrDefault() {
        return (reminderDaysBefore == null || reminderDaysBefore != 2) ? 1 : 2;
    }

    // Created and updated times
    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime updatedAt = LocalDateTime.now();

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
