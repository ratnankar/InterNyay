package com.internyay.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.Collections;

// Verifies Google ID tokens against the configured client id
@Service
@Slf4j
public class GoogleTokenVerifier {

    // The verified parts of the Google account we use
    public record GoogleIdentity(String subject, String email, String name) {}

    private final String clientId;
    private final GoogleIdTokenVerifier verifier;

    // No client id means Google sign-in is switched off
    public GoogleTokenVerifier(@Value("${internyay.google.client-id:}") String clientId) {

        this.clientId = clientId == null ? "" : clientId.trim();

        this.verifier = this.clientId.isEmpty()
                ? null
                : new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), GsonFactory.getDefaultInstance())
                        .setAudience(Collections.singletonList(this.clientId))
                        .build();
    }

    // Rejects invalid tokens and unverified emails
    public GoogleIdentity verify(String idToken) {

        if (verifier == null) {
            throw new IllegalStateException(
                    "Google sign-in is not configured on this server (set GOOGLE_CLIENT_ID)");
        }

        GoogleIdToken token;
        try {
            token = verifier.verify(idToken);
        } catch (GeneralSecurityException | IOException e) {
            log.warn("Google ID token verification failed: {}", e.toString());
            throw new IllegalStateException("Could not verify your Google sign-in right now — please try again");
        }

        if (token == null) {
            throw new IllegalArgumentException("Your Google sign-in could not be verified — please try again");
        }

        GoogleIdToken.Payload payload = token.getPayload();

        String email = payload.getEmail();
        if (email == null || email.isBlank() || !Boolean.TRUE.equals(payload.getEmailVerified())) {
            throw new IllegalArgumentException("Your Google account's email address is not verified");
        }

        Object rawName = payload.get("name");
        String name = rawName instanceof String s && !s.isBlank()
                ? s.trim()
                : email.substring(0, email.indexOf('@') > 0 ? email.indexOf('@') : email.length());

        return new GoogleIdentity(payload.getSubject(), email, name);
    }
}
