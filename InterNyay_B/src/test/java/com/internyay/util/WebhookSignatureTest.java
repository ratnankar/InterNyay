package com.internyay.util;

import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;

class WebhookSignatureTest {

    private static final String SECRET = "app-secret";
    private static final byte[] BODY = "{\"entry\":[]}".getBytes(StandardCharsets.UTF_8);

    private static String sign(byte[] body, String secret) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return "sha256=" + HexFormat.of().formatHex(mac.doFinal(body));
    }

    @Test
    void acceptsTheSignatureMetaWouldSend() throws Exception {
        assertThat(WebhookSignature.valid(BODY, sign(BODY, SECRET), SECRET)).isTrue();
    }

    @Test
    void acceptsUpperCaseHex() throws Exception {
        String header = "sha256=" + sign(BODY, SECRET).substring(7).toUpperCase();
        assertThat(WebhookSignature.valid(BODY, header, SECRET)).isTrue();
    }

    @Test
    void rejectsAChangedBody() throws Exception {
        String header = sign(BODY, SECRET);
        byte[] changed = "{\"entry\":[1]}".getBytes(StandardCharsets.UTF_8);
        assertThat(WebhookSignature.valid(changed, header, SECRET)).isFalse();
    }

    @Test
    void rejectsAnotherSecret() throws Exception {
        assertThat(WebhookSignature.valid(BODY, sign(BODY, "other"), SECRET)).isFalse();
    }

    @Test
    void rejectsMissingOrMalformedHeaders() {
        assertThat(WebhookSignature.valid(BODY, null, SECRET)).isFalse();
        assertThat(WebhookSignature.valid(BODY, "", SECRET)).isFalse();
        assertThat(WebhookSignature.valid(BODY, "sha1=abc", SECRET)).isFalse();
        assertThat(WebhookSignature.valid(BODY, "sha256=", SECRET)).isFalse();
    }

    @Test
    void rejectsEverythingWhenNoSecretIsConfigured() throws Exception {
        assertThat(WebhookSignature.valid(BODY, sign(BODY, ""), "")).isFalse();
        assertThat(WebhookSignature.valid(BODY, sign(BODY, SECRET), null)).isFalse();
    }
}
