package com.internyay.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

// Rate limit settings from application.properties (internyay.rate-limit.*)
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "internyay.rate-limit")
public class RateLimitProperties {

    // Master switch, false turns every rule off
    private boolean enabled = true;

    // Email + password login
    private Rule login = new Rule(10, 15);

    // Google sign-in and Google registration
    private Rule google = new Rule(20, 15);

    // Endpoints that send a code by email
    private Rule otpSend = new Rule(5, 15);

    // Endpoints that check a code
    private Rule otpVerify = new Rule(10, 15);

    // One rule: <capacity> requests allowed per <windowMinutes>, tokens flow back evenly over the window
    @Getter
    @Setter
    public static class Rule {
        private int capacity;
        private int windowMinutes;

        public Rule() {
        }

        public Rule(int capacity, int windowMinutes) {
            this.capacity = capacity;
            this.windowMinutes = windowMinutes;
        }
    }
}
