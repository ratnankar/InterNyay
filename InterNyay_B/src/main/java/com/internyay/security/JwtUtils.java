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

    // How long a token stays valid
    @Value("${internyay.jwt.expiration-ms}")
    private long expirationMs;

    // Signing key built from the secret (must be at least 32 bytes for HS256)
    private SecretKey getKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    // Creates a signed token with the email as subject
    public String generateToken(UserDetails userDetails) {
        Date now = new Date();
        return Jwts.builder()
                .subject(userDetails.getUsername())
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expirationMs))
                .signWith(getKey(), Jwts.SIG.HS256)
                .compact();
    }

    // Verifies the signature and expiry, then returns the claims
    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(getKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
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
                    && claims.getExpiration().after(new Date());
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
