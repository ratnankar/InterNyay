package com.internyay.dto;

import com.internyay.entity.Plan;
import lombok.*;

import java.util.Arrays;
import java.util.List;

// Plan as sent to the frontend
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class PlanDto {
    public Long id;
    public String code;
    public String name;
    public String tagline;
    // Null when the admin left the price blank
    public Integer priceMonthly;
    // Offer price, null when the plan has no discount
    public Integer discountPrice;
    // Calculated from priceMonthly and discountPrice (whole percent), null when the plan has no discount
    public Integer discountPercent;
    // Yearly price, null when the plan has no yearly option
    public Integer priceYearly;
    // Yearly offer price, null when there is no yearly discount
    public Integer discountPriceYearly;
    // Calculated from priceYearly and discountPriceYearly (whole percent), null when there is no yearly discount
    public Integer discountPercentYearly;
    // True when the plan is not open for sign-up yet
    public boolean comingSoon;
    // ADVOCATE, BUSINESS or BOTH: who the plan is shown to
    public String audience;
    // True for the plan that carries the "Most popular" badge
    public boolean mostPopular;
    public Integer associateLimit;
    // Lines shown on the pricing card
    public List<String> features;
    // Feature keys the plan unlocks, null means every feature
    public List<String> featureKeys;
    public Integer sortOrder;
    public boolean freeMonthly;
    public boolean freeYearly;
    public boolean enabled;
    // Advocate accounts on this plan; only filled in the admin plan list
    public long usersCount;

    // Builds the DTO from the entity, comma and line separated text becomes lists
    public static PlanDto from(Plan p) {
        return PlanDto.builder()
                .id(p.getId()).code(p.getCode()).name(p.getName()).tagline(p.getTagline())
                .priceMonthly(p.getPriceMonthly())
                .discountPrice(validDiscount(p.getPriceMonthly(), p.getDiscountPrice()) ? p.getDiscountPrice() : null)
                .discountPercent(validDiscount(p.getPriceMonthly(), p.getDiscountPrice())
                        ? percentOff(p.getPriceMonthly(), p.getDiscountPrice()) : null)
                .priceYearly(p.getPriceYearly())
                .discountPriceYearly(validDiscount(p.getPriceYearly(), p.getDiscountPriceYearly()) ? p.getDiscountPriceYearly() : null)
                .discountPercentYearly(validDiscount(p.getPriceYearly(), p.getDiscountPriceYearly())
                        ? percentOff(p.getPriceYearly(), p.getDiscountPriceYearly()) : null)
                .comingSoon(p.isComingSoon())
                .audience(p.getAudience() == null ? Plan.AUDIENCE_ADVOCATE : p.getAudience())
                .mostPopular(p.isMostPopular())
                .associateLimit(p.getAssociateLimit())
                .features(splitFeatures(p.getFeatures()))
                .featureKeys(p.getFeatureKeys() == null ? null
                        : Arrays.stream(p.getFeatureKeys().split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList())
                .sortOrder(p.getSortOrder())
                .freeMonthly(p.isFreeFor(false))
                .freeYearly(p.isFreeFor(true))
                .enabled(p.isEnabled())
                .build();
    }

    // A discount only counts when there is a price and the offer price is lower than it
    // (used for both the monthly and the yearly price)
    private static boolean validDiscount(Integer price, Integer discountPrice) {
        return price != null && discountPrice != null
                && price > 0 && discountPrice >= 0
                && discountPrice < price;
    }

    // Whole percent saved, e.g. 999 -> 799 is 20
    public static int percentOff(int price, int discountPrice) {
        return (int) Math.round((price - discountPrice) * 100.0 / price);
    }

    // One feature per line, empty lines are dropped
    public static List<String> splitFeatures(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        return Arrays.stream(raw.split("\\R")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }
}
