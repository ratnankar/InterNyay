package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// Every account in the app: admin, advocate and associate. The same email can exist under different roles
@Entity
@Table(name = "users",
        uniqueConstraints = @UniqueConstraint(name = "uk_users_email_role",
                columnNames = {"email", "role"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String email;

    // Stored as a BCrypt hash
    @Column(nullable = false)
    private String password;

    // BCrypt hash of the 4-digit PIN that guards the Transactions page, empty until the user creates one
    @Column(length = 100)
    private String txnPin;

    // Wrong PIN guesses in a row, and when the PIN stays locked until after too many of them
    private Integer txnPinAttempts;

    private LocalDateTime txnPinLockedUntil;

    private LocalDateTime txnPinChangedAt;

    // False for accounts created with Google that have no password yet
    @Builder.Default
    private boolean passwordSet = true;

    // Google account id when the user signed up with Google
    @Column(length = 64)
    private String googleId;

    // Subscription plan, empty means FREE
    @Column(length = 30)
    private String planCode;

    // Most hearings the user takes on one day, empty means no limit. A limit set for one date replaces it (see HearingDayLimit)
    private Integer dailyHearingLimit;

    // Profile details
    private String phone;
    private String barNo;
    @Column(length = 1000)
    private String specialization;
    private String chamber;

    // Courts the user works at most, as ids of the court table (a court + district row, or a high court), comma separated.
    // Empty means no preference was set: the court with the most cases is used instead
    @Column(length = 500)
    private String courtPreferences;

    // Profile photo stored as base64 text
    @Column(columnDefinition = "LONGTEXT")
    private String profilePicture;

    // UPI id and QR code used for fee payments
    private String upiId;

    private String qrCodeId;

    // ADMIN, ADVOCATE or ASSOCIATE
    @Builder.Default
    @Column(nullable = false)
    private String role = "ADVOCATE";

    // Admin can deactivate an account
    @Builder.Default
    @Column(nullable = false)
    private Boolean active = true;

    // True when the user deactivated their own account
    @Builder.Default
    private Boolean selfDeactivated = false;

    // Code an advocate shares so associates can join
    @Column(unique = true, length = 20)
    private String advocateCode;

    // For an associate, the advocate they work under
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "advocate_id")
    private User advocate;

    // Associates this advocate may add, set by an admin. null = use the plan's limit, -1 = unlimited
    @Column(name = "associate_limit")
    private Integer associateLimit;

    // Account timestamps
    @Builder.Default
    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime updatedAt;

    private LocalDateTime lastLoginAt;

    private LocalDateTime passwordChangedAt;

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }

    // Role names
    public static final String ADMIN     = "ADMIN";
    public static final String ADVOCATE  = "ADVOCATE";
    public static final String ASSOCIATE = "ASSOCIATE";

    // Shown when a Google only account tries to log in with a password
    public static final String NO_PASSWORD_MESSAGE =
            "This account signs in with Google and has no password yet. "
          + "Set a password on your Profile page first.";

    // False for Google accounts that have not set a password yet
    public boolean hasPassword() {
        return passwordSet;
    }

    // True once the user has created a transaction PIN
    public boolean hasTxnPin() {
        return txnPin != null && !txnPin.isBlank();
    }

    // Role checks
    public boolean isAdmin() {
        return ADMIN.equalsIgnoreCase(role);
    }

    public boolean isAssociate() {
        return ASSOCIATE.equalsIgnoreCase(role);
    }

    public boolean isAdvocate() {
        return ADVOCATE.equalsIgnoreCase(role);
    }
}
