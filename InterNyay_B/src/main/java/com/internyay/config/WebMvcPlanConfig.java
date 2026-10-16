package com.internyay.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

// Registers the plan feature check for all /api requests
@Configuration
@RequiredArgsConstructor
public class WebMvcPlanConfig implements WebMvcConfigurer {
    private final PlanFeatureInterceptor planFeatureInterceptor;

    @Override
    // Runs the plan feature check on every API request
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(planFeatureInterceptor).addPathPatterns("/api/**");
    }
}
