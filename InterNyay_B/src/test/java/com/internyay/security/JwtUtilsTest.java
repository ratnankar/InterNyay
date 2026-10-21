package com.internyay.security;

import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Date;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Token creation and checking, no Spring context needed
class JwtUtilsTest {

    private static final String SECRET = "unit-test-secret-unit-test-secret-1234567890";

    private JwtUtils jwt;
    private UserDetails user;

    @BeforeEach
    void setUp() {
        jwt = jwtWith(SECRET, 60_000L);
        user = User.withUsername("42").password("x").authorities(List.of()).build();
    }

    private static JwtUtils jwtWith(String secret, long expirationMs) {
        JwtUtils utils = new JwtUtils();
        ReflectionTestUtils.setField(utils, "secret", secret);
        ReflectionTestUtils.setField(utils, "expirationMs", expirationMs);
        return utils;
    }

    @Test
    void tokenCarriesTheUsernameAsSubject() {
        assertThat(jwt.extractUsername(jwt.generateToken(user))).isEqualTo("42");
    }

    @Test
    void validTokenForTheSameUserIsAccepted() {
        assertThat(jwt.validateToken(jwt.generateToken(user), user)).isTrue();
    }

    @Test
    void tokenOfAnotherUserIsRejected() {
        UserDetails other = User.withUsername("43").password("x").authorities(List.of()).build();

        assertThat(jwt.validateToken(jwt.generateToken(user), other)).isFalse();
    }

    @Test
    void expiredTokenIsRejected() {
        String token = jwtWith(SECRET, -1_000L).generateToken(user);

        assertThat(jwt.validateToken(token, user)).isFalse();
        assertThatThrownBy(() -> jwt.extractUsername(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void tokenSignedWithAnotherSecretIsRejected() {
        String token = jwtWith("another-secret-another-secret-another-secret", 60_000L).generateToken(user);

        assertThat(jwt.validateToken(token, user)).isFalse();
    }

    @Test
    void tamperedSignatureIsRejected() {
        String token = jwt.generateToken(user);
        int i = token.length() - 3;
        char c = token.charAt(i);
        String tampered = token.substring(0, i) + (c == 'A' ? 'B' : 'A') + token.substring(i + 1);

        assertThat(jwt.validateToken(tampered, user)).isFalse();
    }

    @Test
    void zeroExpirationMeansTheTokenNeverExpires() {
        JwtUtils forever = jwtWith(SECRET, 0L);
        String token = forever.generateToken(user);

        assertThat(forever.validateToken(token, user)).isTrue();
    }

    @Test
    void garbageIsRejected() {
        assertThat(jwt.validateToken("not-a-token", user)).isFalse();
        assertThat(jwt.validateToken("", user)).isFalse();
    }

    @Test
    void unsignedTokenIsRejected() {
        String unsigned = Jwts.builder().subject("42")
                .expiration(new Date(System.currentTimeMillis() + 60_000)).compact();

        assertThat(jwt.validateToken(unsigned, user)).isFalse();
    }

    @Test
    void tokensAreIssuedWithHs256() {
        String header = new String(Base64.getUrlDecoder().decode(jwt.generateToken(user).split("\\.")[0]),
                StandardCharsets.UTF_8);

        assertThat(header).contains("HS256");
    }
}
