package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.Locale;

// A judge: name and photo only. Where the judge sits is a listing (see Judge), a judge can hold none, one or several.
// A removed judge is switched off (active = false), never deleted when there is history behind it
@Entity
@Table(name = "judge_profiles")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class JudgeProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    // Lower case name with the spaces collapsed, two profiles with the same key are the same judge
    @Column(name = "name_key", nullable = false)
    private String nameKey;

    // Photo stored as base64 text
    @Column(columnDefinition = "LONGTEXT")
    private String photo;

    @Builder.Default
    @Column(name = "active", nullable = false, columnDefinition = "boolean default true")
    private boolean active = true;

    // True only for the one special "Vacant" profile that a court holds while it has no judge.
    // It is never shown as a judge to pick and cannot be edited or removed
    @Builder.Default
    @Column(name = "vacant", nullable = false, columnDefinition = "boolean default false")
    private boolean vacant = false;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // Name with spaces collapsed and lower case
    public static String keyOf(String name) {
        return name == null ? "" : name.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
        nameKey = keyOf(name);
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
        nameKey = keyOf(name);
    }
}
