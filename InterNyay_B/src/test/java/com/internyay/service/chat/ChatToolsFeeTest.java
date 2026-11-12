package com.internyay.service.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

// Court fee amounts the assistant quotes must stay equal to the Court Fee Calculator page (same scales, same rounding)
class ChatToolsFeeTest {

    private static JsonNode cfg;
    private static final Map<String, String> STATE_SCALE = new HashMap<>();

    @BeforeAll
    static void load() throws Exception {
        try (InputStream in = new ClassPathResource("fee-calculator-defaults.json").getInputStream()) {
            cfg = new ObjectMapper().readTree(in);
        }
        cfg.path("jurisdictions").forEach(j -> STATE_SCALE.put(j.path("key").asText(), j.path("scale").asText()));
    }

    private static double adValorem(String state, double value) {
        return ChatTools.money(ChatTools.scaleFee(cfg.path("scales").path(STATE_SCALE.get(state)), value));
    }

    @Test
    void adValoremFeesFollowTheStateTables() {
        assertEquals(7224.0, adValorem("delhi", 500000));
        assertEquals(4442.4, adValorem("delhi", 215000));
        assertEquals(9670.0, adValorem("up", 123456));
        assertEquals(213800.0, adValorem("haryana", 9000000));
    }

    @Test
    void centralScaleIsCappedAtThreeThousand() {
        assertEquals(3000.0, adValorem("central", 5000000));
    }

    @Test
    void consumerFeeFollowsTheCommissionScale() {
        assertEquals(200.0, ChatTools.money(ChatTools.scaleFee(cfg.path("scales").path("consumer"), 800000)));
        assertEquals(0.0, ChatTools.money(ChatTools.scaleFee(cfg.path("scales").path("consumer"), 400000)));
    }

    @Test
    void floorIsShownOnlyWithABuilding() {
        assertEquals("Main (Floor 2)", ChatTools.buildingWithFloor("Main", "2"));
        assertEquals("Main (Ground)", ChatTools.buildingWithFloor("Main", "Ground"));
        assertEquals("Main", ChatTools.buildingWithFloor("Main", ""));
        assertNull(ChatTools.buildingWithFloor("", "2"));
    }
}
