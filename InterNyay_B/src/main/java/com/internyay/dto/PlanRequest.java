package com.internyay.dto;

import jakarta.validation.constraints.Min;
import lombok.*;

import java.util.List;

// Used by the admin to edit a plan
@Data @NoArgsConstructor @AllArgsConstructor
public class PlanRequest {
    // Only used when creating a plan: letters, digits and underscores, like GOLD or LAW_FIRM
    private String code;
    private String name;
    private String tagline;
    // Price cannot be negative; null (blank) clears the price
    @Min(0) private Integer priceMonthly;
    // Offer price, must be lower than priceMonthly; null (blank) means no discount
    @Min(0) private Integer discountPrice;
    // Yearly price; null (blank) means no yearly option
    @Min(0) private Integer priceYearly;
    // Yearly offer price, must be lower than priceYearly; null (blank) means no yearly discount
    @Min(0) private Integer discountPriceYearly;
    // Marks the plan as coming soon; null leaves it unchanged
    private Boolean comingSoon;
    // ADVOCATE, BUSINESS or BOTH; null leaves it unchanged (a new plan defaults to ADVOCATE)
    private String audience;
    // Marks the plan as "Most popular"; null leaves it unchanged
    private Boolean mostPopular;
    // Associate limit, -1 means unlimited
    @Min(-1) private Integer associateLimit;
    private List<String> features;
    private List<String> featureKeys;
    private Integer sortOrder;
    private Boolean freeMonthly;
    private Boolean freeYearly;
    private Boolean enabled;
}
