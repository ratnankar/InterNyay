package com.internyay.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.entity.WhatsAppMessageLog;
import com.internyay.repository.WhatsAppMessageLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WhatsAppWebhookServiceTest {

    @Mock WhatsAppMessageLogRepository repo;
    private WhatsAppWebhookService service;
    private WhatsAppMessageLog row;

    @BeforeEach
    void setUp() {
        service = new WhatsAppWebhookService(repo, new ObjectMapper());
        row = new WhatsAppMessageLog();
        row.setWaMessageId("wamid.1");
        row.setDeliveryStatus("SENT");
        when(repo.findFirstByWaMessageId("wamid.1")).thenReturn(Optional.of(row));
        when(repo.findFirstByWaMessageId("wamid.unknown")).thenReturn(Optional.empty());
        when(repo.save(any(WhatsAppMessageLog.class))).thenAnswer(i -> i.getArgument(0));
    }

    private static byte[] statusBody(String id, String status, String errors) {
        String json = "{\"object\":\"whatsapp_business_account\",\"entry\":[{\"changes\":[{\"field\":\"messages\","
                + "\"value\":{\"statuses\":[{\"id\":\"" + id + "\",\"status\":\"" + status + "\""
                + (errors == null ? "" : ",\"errors\":" + errors) + "}]}}]}]}";
        return json.getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void deliveredThenReadMovesForward() {
        service.handle(statusBody("wamid.1", "delivered", null));
        assertThat(row.getDeliveryStatus()).isEqualTo("DELIVERED");
        assertThat(row.getDeliveryUpdatedAt()).isNotNull();

        service.handle(statusBody("wamid.1", "read", null));
        assertThat(row.getDeliveryStatus()).isEqualTo("READ");
    }

    @Test
    void anOlderStatusArrivingLateIsIgnored() {
        row.setDeliveryStatus("READ");
        service.handle(statusBody("wamid.1", "delivered", null));
        service.handle(statusBody("wamid.1", "sent", null));
        assertThat(row.getDeliveryStatus()).isEqualTo("READ");
        verify(repo, never()).save(any());
    }

    @Test
    void aFailureIsRecordedWithItsReason() {
        service.handle(statusBody("wamid.1", "failed",
                "[{\"code\":131026,\"title\":\"Message undeliverable\"}]"));
        assertThat(row.getDeliveryStatus()).isEqualTo("FAILED");
        assertThat(row.getError()).isEqualTo("131026 Message undeliverable");
    }

    @Test
    void aFailureNeverOverwritesADeliveredMessage() {
        row.setDeliveryStatus("DELIVERED");
        service.handle(statusBody("wamid.1", "failed", "[{\"code\":1,\"title\":\"x\"}]"));
        assertThat(row.getDeliveryStatus()).isEqualTo("DELIVERED");
        assertThat(row.getError()).isNull();
    }

    @Test
    void unknownMessagesAndOtherStatusesAreIgnored() {
        service.handle(statusBody("wamid.unknown", "delivered", null));
        service.handle(statusBody("wamid.1", "deleted", null));
        verify(repo, never()).save(any());
    }

    @Test
    void junkAndIncomingMessagesDoNotThrow() {
        assertThatCode(() -> service.handle("not json".getBytes(StandardCharsets.UTF_8))).doesNotThrowAnyException();
        assertThatCode(() -> service.handle("{}".getBytes(StandardCharsets.UTF_8))).doesNotThrowAnyException();
        byte[] incoming = ("{\"entry\":[{\"changes\":[{\"field\":\"messages\",\"value\":{\"messages\":"
                + "[{\"from\":\"911234567890\",\"type\":\"text\"}]}}]}]}").getBytes(StandardCharsets.UTF_8);
        assertThatCode(() -> service.handle(incoming)).doesNotThrowAnyException();
        verify(repo, never()).save(any());
    }
}
