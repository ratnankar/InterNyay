package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// A subscription plan. Only one row per code
@Entity
@Table(name = "plans", uniqueConstraints = @UniqueConstraint(name = "uk_plans_code", columnNames = "code"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Plan {

    // Who a plan is for: ADVOCATE plans are shown to advocates and visitors, BUSINESS plans only to business accounts, BOTH to everyone
    public static final String AUDIENCE_ADVOCATE = "ADVOCATE";
    public static final String AUDIENCE_BUSINESS = "BUSINESS";
    public static final String AUDIENCE_BOTH = "BOTH";

    // Plan codes
    public static final String FREE = "FREE";
    public static final String BASIC = "BASIC";
    public static final String PROFESSIONAL = "PROFESSIONAL";
    public static final String BUSINESS = "BUSINESS";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Code used in the app, like FREE or BASIC
    @Column(nullable = false, length = 30)
    private String code;

    @Column(nullable = false)
    private String name;

    // Short line shown under the name
    private String tagline;

    // Price per month in rupees; null (blank) means no price is shown, 0 means free
    private Integer priceMonthly;

    // Optional offer price per month in rupees; when set (and lower than priceMonthly) the normal price is
    // shown cut and this one is charged. The discount percentage is never stored, it is calculated
    private Integer discountPrice;

    // Price per year in rupees; null (blank) means the plan has no yearly option
    private Integer priceYearly;

    // Optional offer price per year, same rules as discountPrice (must be lower than priceYearly)
    private Integer discountPriceYearly;

    // Coming soon plans are shown on the landing page without a Get started button
    // and cannot be chosen or requested by advocates
    @Builder.Default
    @Column(nullable = false)
    private boolean comingSoon = false;

    // Who sees this plan: ADVOCATE (default), BUSINESS or BOTH. Business-only plans are hidden from the landing page
    // and from advocates; BOTH plans are shown to advocates and to business accounts
    @Builder.Default
    @Column(nullable = false, length = 20)
    private String audience = AUDIENCE_ADVOCATE;

    // The plan marked with the "Most popular" badge. Only one plan per audience can have it
    @Builder.Default
    @Column(nullable = false)
    private boolean mostPopular = false;

    // How many associates the advocate can add
    @Builder.Default
    @Column(nullable = false)
    private Integer associateLimit = 0;

    // Bullet points shown on the pricing card, one per line
    @Column(columnDefinition = "LONGTEXT")
    private String features;

    // Comma separated feature keys the plan unlocks, empty means everything
    @Column(columnDefinition = "TEXT")
    private String featureKeys;

    // Order in which plans are shown
    @Builder.Default
    @Column(nullable = false)
    private Integer sortOrder = 0;

    @Builder.Default
    @Column(nullable = false)
    private boolean freeMonthly = false;

    @Builder.Default
    @Column(nullable = false)
    private boolean freeYearly = false;

    @Builder.Default
    @Column(nullable = false)
    private boolean enabled = true;

    // True when the plan costs nothing for the billing period. A plan that is free for a whole year is free monthly too,
    // so the yearly rule is checked for both periods
    public boolean isFreeFor(boolean yearly) {
        return yearly ? freeYearlyRule() : freeMonthlyRule() || freeYearlyRule();
    }

    private boolean freeYearlyRule() {
        return freeYearly || (priceYearly != null && priceYearly > 0 && discountPriceYearly != null && discountPriceYearly == 0);
    }

    private boolean freeMonthlyRule() {
        return freeMonthly
                || (priceMonthly != null && priceMonthly == 0)
                || (priceMonthly != null && priceMonthly > 0 && discountPrice != null && discountPrice == 0);
    }
}
