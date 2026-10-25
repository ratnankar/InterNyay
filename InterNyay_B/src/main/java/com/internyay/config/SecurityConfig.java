package com.internyay.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.security.JwtAuthFilter;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

// Spring Security setup: stateless JWT auth, CORS, security headers and URL access rules
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    // Reads the Bearer token on each request
    private final JwtAuthFilter jwtAuthFilter;
    // Limits login, OTP and Google sign-in calls per IP
    private final RateLimitFilter rateLimitFilter;
    // Rejects an identical second save while the first one is still running (double click, second tab)
    private final DuplicateSubmitFilter duplicateSubmitFilter;
    private final ObjectMapper objectMapper;

    // Frontend origins allowed to call the API
    @Value("${internyay.cors.allowed-origins}")
    private String[] allowedOrigins;

    // Main security rules
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {

        http
                // CSRF is off because auth is a Bearer token, not a cookie
                .csrf(csrf -> csrf.disable())

                .cors(cors -> cors.configurationSource(corsConfigurationSource()))

                // No server side sessions
                .sessionManagement(sm ->
                        sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                // Browser security headers
                .headers(headers -> headers
                        .frameOptions(frame -> frame.deny())
                        .contentTypeOptions(Customizer.withDefaults())
                        .httpStrictTransportSecurity(hsts -> hsts
                                .includeSubDomains(true)
                                .maxAgeInSeconds(31536000))
                        .referrerPolicy(referrer -> referrer
                                .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                )

                // Return JSON for 401/403 instead of the default HTML page
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, authException) ->
                                writeJsonError(response, HttpStatus.UNAUTHORIZED,
                                        "Authentication required"))
                        .accessDeniedHandler((request, response, accessDeniedException) ->
                                writeJsonError(response, HttpStatus.FORBIDDEN,
                                        "You do not have permission to do that"))
                )

                // URL access rules, first match wins
                .authorizeHttpRequests(auth -> auth

                        // Public: login, registration, OTP, Google sign-in and password reset
                        .requestMatchers("/api/auth/login", "/api/auth/register",
                                "/api/auth/register/send-otp", "/api/auth/register/verify-otp",
                                "/api/auth/google/login", "/api/auth/google/register",
                                "/api/auth/forgot-password/send-otp", "/api/auth/forgot-password/reset").permitAll()

                        // Public: landing page contact form
                        .requestMatchers(HttpMethod.POST, "/api/public/contact").permitAll()

                        // Public: plans shown on the landing page and registration
                        .requestMatchers(HttpMethod.GET, "/api/public/plans", "/api/public/options").permitAll()

                        // Preflight requests
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                        // One-time first-admin setup, public URL but guarded by the setup key header.
                        // Must stay above the /api/admin/** rule
                        .requestMatchers(HttpMethod.POST, "/api/admin/setup").permitAll()

                        // Admin console
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")

                        // Everyone reads the court calendar, only admin changes it
                        .requestMatchers(HttpMethod.GET, "/api/court-calendar/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/court-calendar/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/court-calendar/**").hasRole("ADMIN")

                        // Legal forms: admin uploads and edits, others only read
                        .requestMatchers(HttpMethod.POST, "/api/legal-forms/upload").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/legal-forms/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/legal-forms/**").hasRole("ADMIN")

                        // Any user can dismiss a notification, only admin can publish or edit them
                        .requestMatchers(HttpMethod.POST, "/api/notifications/*/dismiss").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/notifications/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/notifications/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/notifications/**").hasRole("ADMIN")

                        // Holidays are maintained by admin
                        .requestMatchers(HttpMethod.POST, "/api/holidays/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/holidays/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/holidays/**").hasRole("ADMIN")

                        // Quick Access data (judges, rosters, directories) is maintained by admin
                        .requestMatchers(HttpMethod.POST, "/api/quick-access/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/quick-access/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/quick-access/**").hasRole("ADMIN")

                        // Everything else needs a valid login
                        .anyRequest().authenticated()
                )

                // Token check runs before the username/password filter
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)

                // Double-save guard runs after the login check, before any controller
                .addFilterAfter(duplicateSubmitFilter, JwtAuthFilter.class)

                // Rate limit runs first, so blocked requests never reach the password check or the email sender
                .addFilterBefore(rateLimitFilter, JwtAuthFilter.class);

        return http.build();
    }

    // CORS rules for the React frontend
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {

        CorsConfiguration config = new CorsConfiguration();

        config.setAllowedOrigins(Arrays.asList(allowedOrigins));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        // Lets the frontend read the file name when downloading, and the renewed login token
        config.setExposedHeaders(List.of("Content-Disposition", "X-Refreshed-Token"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return source;
    }

    // Writes the {"message": ...} error body used across the API
    private void writeJsonError(HttpServletResponse response, HttpStatus status, String message)
            throws java.io.IOException {

        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), Map.of("message", message));
    }
}
