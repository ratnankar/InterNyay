package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// A listing in Quick Access: a court seat with its court room and contact details, held by one judge (JudgeProfile).
// The judge's name and photo live on the profile. A removed listing is switched off (active = false), its history stays
@Entity
@Table(name = "judges")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Judge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // The judge who holds this listing. Changing the judge goes through "Change judge" so the court history stays right
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "profile_id", nullable = false)
    private JudgeProfile profile;

    @Column(nullable = false)
    private String court;

    @Column(nullable = false)
    private String district;

    // Row of the courts table for this court and district. The text columns above stay for now (step 1 of moving to ids)
    @Column(name = "court_id")
    private Long courtId;

    // Post of the judge, like ASJ or CMM
    private String designation;
    // Court room and building
    private String courtRoomNo;
    private String building;
    private String floor;

    // Video conferencing details
    private String vcMeetingId;
    // Court code of the listing, optional
    private String courtCode;
    private String courtEmail;

    @Column(length = 1000)
    private String virtualCourtLink;

    // Court reader contact
    private String courtReaderName;
    private String courtReaderPhone;
    // Matters the judge handles
    @Column(columnDefinition = "TEXT")
    private String jurisdiction;

    // False once the listing was removed. It is kept with its court history but no longer shown or matched
    @Builder.Default
    @Column(name = "active", nullable = false, columnDefinition = "boolean default true")
    private boolean active = true;

    private LocalDateTime archivedAt;

    // Created and updated times
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // Name of the judge who holds this listing
    public String getName() { return profile == null ? null : profile.getName(); }

    // Photo of the judge who holds this listing
    public String getPhoto() { return profile == null ? null : profile.getPhoto(); }

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }

}
