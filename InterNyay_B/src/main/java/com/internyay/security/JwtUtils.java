package com.internyay.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

// Creates and validates the JWT tokens used for login
@Component
public class JwtUtils {

    // Signing secret from application.properties
    @Value("${internyay.jwt.secret}")
    private String secret;

    // How long a token stays valid. 0 or less means it never expires (the user stays signed in until they sign out)
    @Value("${internyay.jwt.expiration-ms:0}")
    private long expirationMs;

    // A token older than this gets swapped for a new one on the next request (sliding session). 0 or less turns renewal off
    @Value("${internyay.jwt.refresh-after-ms:86400000}")
    private long refreshAfterMs;

    // Signing key built from the secret (must be at least 32 bytes for HS256)
    private SecretKey getKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    // Creates a signed token with the email as subject
    public String generateToken(UserDetails userDetails) {
        Date now = new Date();
        var builder = Jwts.builder()
                .subject(userDetails.getUsername())
                .issuedAt(now);
        if (expirationMs > 0) builder.expiration(new Date(now.getTime() + expirationMs));
        return builder.signWith(getKey(), Jwts.SIG.HS256).compact();
    }

    // Verifies the signature and expiry, then returns the claims
    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(getKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    // True when the token has an expiry and was issued long enough ago that it should be renewed
    public boolean needsRefresh(String token) {
        if (expirationMs <= 0 || refreshAfterMs <= 0) return false;
        try {
            Date issued = parseClaims(token).getIssuedAt();
            return issued != null && System.currentTimeMillis() - issued.getTime() >= refreshAfterMs;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    // Reads the email out of the token
    public String extractUsername(String token) {
        return parseClaims(token).getSubject();
    }

    // Token must belong to this user and must not be expired
    public boolean validateToken(String token, UserDetails userDetails) {
        try {
            Claims claims = parseClaims(token);
            return claims.getSubject().equals(userDetails.getUsername())
                    && (claims.getExpiration() == null || claims.getExpiration().after(new Date()));
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
