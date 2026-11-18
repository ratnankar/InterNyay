package com.internyay.controller;

import com.internyay.service.WhatsAppWebhookService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class WhatsAppWebhookControllerTest {

    private static final String TOKEN = "verify-me";
    private static final String SECRET = "app-secret";
    private static final byte[] BODY = "{\"entry\":[]}".getBytes(StandardCharsets.UTF_8);

    @Mock WhatsAppWebhookService service;
    private WhatsAppWebhookController controller;

    @BeforeEach
    void setUp() {
        controller = new WhatsAppWebhookController(service, TOKEN, SECRET);
    }

    private static String sign(byte[] body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return "sha256=" + HexFormat.of().formatHex(mac.doFinal(body));
    }

    @Test
    void echoesTheChallengeWhenTheTokenMatches() {
        ResponseEntity<String> res = controller.verify("subscribe", TOKEN, "12345");
        assertThat(res.getStatusCode().value()).isEqualTo(200);
        assertThat(res.getBody()).isEqualTo("12345");
    }

    @Test
    void refusesAWrongTokenWrongModeOrMissingParts() {
        assertThat(controller.verify("subscribe", "nope", "1").getStatusCode().value()).isEqualTo(403);
        assertThat(controller.verify("unsubscribe", TOKEN, "1").getStatusCode().value()).isEqualTo(403);
        assertThat(controller.verify("subscribe", null, "1").getStatusCode().value()).isEqualTo(403);
        assertThat(controller.verify("subscribe", TOKEN, null).getStatusCode().value()).isEqualTo(403);
    }

    @Test
    void refusesEveryCheckWhenNoTokenIsConfigured() {
        WhatsAppWebhookController open = new WhatsAppWebhookController(service, "", SECRET);
        assertThat(open.verify("subscribe", "", "1").getStatusCode().value()).isEqualTo(403);
    }

    @Test
    void processesAPostWithAValidSignature() throws Exception {
        ResponseEntity<Void> res = controller.receive(BODY, sign(BODY));
        assertThat(res.getStatusCode().value()).isEqualTo(200);
        verify(service).handle(BODY);
    }

    @Test
    void refusesAPostWithABadOrMissingSignature() {
        assertThat(controller.receive(BODY, "sha256=deadbeef").getStatusCode().value()).isEqualTo(403);
        assertThat(controller.receive(BODY, null).getStatusCode().value()).isEqualTo(403);
        verify(service, never()).handle(any());
    }
}
