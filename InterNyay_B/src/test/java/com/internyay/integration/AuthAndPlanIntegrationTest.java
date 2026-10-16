package com.internyay.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.entity.Plan;
import com.internyay.entity.User;
import com.internyay.repository.PlanRepository;
import com.internyay.repository.UserRepository;
import com.internyay.security.JwtUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Login, JWT, the plan check and the rate limit through the whole stack on a real MySQL.
// Skipped automatically when Docker is not running.
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false",
        "internyay.jwt.secret=integration-test-secret-integration-test-secret-123456",
        "internyay.jwt.expiration-ms=3600000",
        "internyay.otp.dry-run=true",
        "whatsapp.dry-run=true",
        "internyay.rate-limit.login.capacity=6",
        "internyay.rate-limit.login.window-minutes=15"
})
@AutoConfigureMockMvc
class AuthAndPlanIntegrationTest {

    @Container
    @ServiceConnection
    static MySQLContainer<?> mysql = new MySQLContainer<>("mysql:8.4");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired PlanRepository plans;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtUtils jwt;

    private static final String PASSWORD = "Correct-Horse-9";

    @BeforeEach
    void data() {
        if (plans.findByCode("FREE").isEmpty()) {
            plans.save(plan("FREE", "documents"));        // no fee calculator
            plans.save(plan("PRO", "court_fee_calculator"));
        }
    }

    private static Plan plan(String code, String featureKeys) {
        return Plan.builder().code(code).name(code).featureKeys(featureKeys)
                .associateLimit(0).sortOrder(0).audience(Plan.AUDIENCE_ADVOCATE).build();
    }

    private User advocate(String email, String planCode) {
        return users.findByEmailAndRole(email, User.ADVOCATE).orElseGet(() -> {
            User u = new User();
            u.setName("Test Advocate");
            u.setEmail(email);
            u.setPassword(encoder.encode(PASSWORD));
            u.setRole(User.ADVOCATE);
            u.setActive(true);
            u.setPlanCode(planCode);
            return users.save(u);
        });
    }

    private String bearerFor(User u) {
        return "Bearer " + jwt.generateToken(org.springframework.security.core.userdetails.User
                .withUsername(String.valueOf(u.getId())).password("x").authorities(List.of()).build());
    }

    private String loginBody(String email, String password) throws Exception {
        return json.writeValueAsString(java.util.Map.of("email", email, "password", password));
    }

    @Test
    void loginReturnsATokenThatOpensProtectedEndpoints() throws Exception {
        advocate("login.ok@example.com", "FREE");

        MvcResult res = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("login.ok@example.com", PASSWORD))
                        .with(r -> { r.setRemoteAddr("10.0.0.1"); return r; }))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andReturn();
        JsonNode body = json.readTree(res.getResponse().getContentAsString());

        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + body.get("token").asText()))
                .andExpect(status().isOk());
    }

    @Test
    void wrongPasswordIsRefused() throws Exception {
        advocate("login.bad@example.com", "FREE");

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("login.bad@example.com", "wrong-password"))
                        .with(r -> { r.setRemoteAddr("10.0.0.2"); return r; }))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void protectedEndpointNeedsAValidToken() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer not-a-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void featureOutsideThePlanIsForbiddenAndInsideItIsAllowed() throws Exception {
        User free = advocate("plan.free@example.com", "FREE");
        User pro = advocate("plan.pro@example.com", "PRO");

        mvc.perform(get("/api/fee-calculator/config").header("Authorization", bearerFor(free)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("not included in your plan")));

        mvc.perform(get("/api/fee-calculator/config").header("Authorization", bearerFor(pro)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.config.filings").isArray());
    }

    @Test
    void tooManyLoginsFromOneIpAreStoppedWith429() throws Exception {
        // Every attempt uses another email so only the per-IP limit can stop it, not the per-email lock
        for (int i = 0; i < 6; i++) {
            mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content(loginBody("nobody" + i + "@example.com", "x"))
                            .with(r -> { r.setRemoteAddr("10.9.9.9"); return r; }))
                    .andExpect(status().isUnauthorized());
        }

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("nobody7@example.com", "x"))
                        .with(r -> { r.setRemoteAddr("10.9.9.9"); return r; }))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.message").exists());

        // Another IP is not affected
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("nobody8@example.com", "x"))
                        .with(r -> { r.setRemoteAddr("10.9.9.10"); return r; }))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void advocateSwitchesToAFreeAccessPlanWithoutPaymentButNotToAPaidOne() throws Exception {
        plans.findByCode("GIFT").orElseGet(() -> plans.save(Plan.builder().code("GIFT").name("Gift")
                .priceMonthly(499).freeMonthly(true).associateLimit(3).sortOrder(9)
                .audience(Plan.AUDIENCE_ADVOCATE).featureKeys("documents").build()));
        plans.findByCode("PAID").orElseGet(() -> plans.save(Plan.builder().code("PAID").name("Paid")
                .priceMonthly(999).associateLimit(3).sortOrder(10)
                .audience(Plan.AUDIENCE_ADVOCATE).featureKeys("documents").build()));
        User advocate = advocate("plan.select@example.com", "FREE");

        mvc.perform(post("/api/plans/select").header("Authorization", bearerFor(advocate))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"PAID\"}"))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/plans/select").header("Authorization", bearerFor(advocate))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"GIFT\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.current.code").value("GIFT"));

        assertThat(users.findById(advocate.getId()).orElseThrow().getPlanCode()).isEqualTo("GIFT");
    }
}
