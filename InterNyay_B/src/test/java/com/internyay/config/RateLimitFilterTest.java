package com.internyay.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

// The per-IP limits on login, Google sign-in and the OTP endpoints
class RateLimitFilterTest {

    private RateLimitProperties props;
    private RateLimitFilter filter;

    @BeforeEach
    void setUp() {
        props = new RateLimitProperties();
        props.setLogin(new RateLimitProperties.Rule(3, 15));
        props.setGoogle(new RateLimitProperties.Rule(2, 15));
        props.setOtpSend(new RateLimitProperties.Rule(2, 15));
        props.setOtpVerify(new RateLimitProperties.Rule(4, 15));
        filter = new RateLimitFilter(props, new ObjectMapper());
    }

    private MockHttpServletResponse call(String method, String uri, String ip) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest(method, uri);
        req.setRemoteAddr(ip);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, new MockFilterChain());
        return res;
    }

    @Test
    void allowsTheCapacityThenBlocksWith429() throws Exception {
        for (int i = 0; i < 3; i++) {
            assertThat(call("POST", "/api/auth/login", "1.1.1.1").getStatus()).isEqualTo(200);
        }

        MockHttpServletResponse blocked = call("POST", "/api/auth/login", "1.1.1.1");

        assertThat(blocked.getStatus()).isEqualTo(429);
        assertThat(Long.parseLong(blocked.getHeader("Retry-After"))).isPositive();
        assertThat(blocked.getContentType()).contains("application/json");
        assertThat(blocked.getContentAsString()).contains("\"message\"").contains("Too many requests");
    }

    @Test
    void eachClientIpHasItsOwnLimit() throws Exception {
        for (int i = 0; i < 4; i++) call("POST", "/api/auth/login", "1.1.1.1");

        assertThat(call("POST", "/api/auth/login", "1.1.1.1").getStatus()).isEqualTo(429);
        assertThat(call("POST", "/api/auth/login", "2.2.2.2").getStatus()).isEqualTo(200);
    }

    @Test
    void googleEndpointsShareOneLimit() throws Exception {
        assertThat(call("POST", "/api/auth/google/login", "1.1.1.1").getStatus()).isEqualTo(200);
        assertThat(call("POST", "/api/auth/google/register", "1.1.1.1").getStatus()).isEqualTo(200);

        assertThat(call("POST", "/api/auth/google/login", "1.1.1.1").getStatus()).isEqualTo(429);
    }

    @Test
    void allThreeSendOtpEndpointsShareOneLimit() throws Exception {
        assertThat(call("POST", "/api/auth/register/send-otp", "1.1.1.1").getStatus()).isEqualTo(200);
        assertThat(call("POST", "/api/auth/forgot-password/send-otp", "1.1.1.1").getStatus()).isEqualTo(200);

        assertThat(call("POST", "/api/auth/me/email/send-otp", "1.1.1.1").getStatus()).isEqualTo(429);
    }

    @Test
    void checkingCodesHasItsOwnLimit() throws Exception {
        for (int i = 0; i < 4; i++) {
            assertThat(call("POST", "/api/auth/register/verify-otp", "1.1.1.1").getStatus()).isEqualTo(200);
        }

        assertThat(call("POST", "/api/auth/forgot-password/reset", "1.1.1.1").getStatus()).isEqualTo(429);
        // The send limit is a different bucket and is untouched
        assertThat(call("POST", "/api/auth/register/send-otp", "1.1.1.1").getStatus()).isEqualTo(200);
    }

    @Test
    void otherEndpointsAndMethodsAreNeverLimited() throws Exception {
        for (int i = 0; i < 20; i++) {
            assertThat(call("POST", "/api/cases", "1.1.1.1").getStatus()).isEqualTo(200);
            assertThat(call("GET", "/api/auth/login", "1.1.1.1").getStatus()).isEqualTo(200);
            assertThat(call("OPTIONS", "/api/auth/login", "1.1.1.1").getStatus()).isEqualTo(200);
        }
    }

    @Test
    void switchedOffMeansNoLimit() throws Exception {
        props.setEnabled(false);

        for (int i = 0; i < 20; i++) {
            assertThat(call("POST", "/api/auth/login", "1.1.1.1").getStatus()).isEqualTo(200);
        }
    }
}
