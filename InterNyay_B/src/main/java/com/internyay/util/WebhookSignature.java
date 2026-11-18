package com.internyay.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;

public final class WebhookSignature {

    private static final String PREFIX = "sha256=";
    private static final String ALGORITHM = "HmacSHA256";

    private WebhookSignature() {}

    public static boolean valid(byte[] body, String header, String secret) {
        if (body == null || secret == null || secret.isBlank()) return false;
        if (header == null || !header.trim().toLowerCase(Locale.ROOT).startsWith(PREFIX)) return false;
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), ALGORITHM));
            String expected = PREFIX + HexFormat.of().formatHex(mac.doFinal(body));
            return MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    header.trim().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException ex) {
            return false;
        }
    }
}
