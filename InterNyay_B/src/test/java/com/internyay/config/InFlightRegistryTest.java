package com.internyay.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InFlightRegistryTest {

    @Test
    void actionNameDropsApiPrefixSortsQueryAndSkipsEmptyValues() {
        assertEquals("POST /cases/12/cause-list/refresh?date=2026-11-05",
                InFlightRegistry.actionName("post", "/api/cases/12/cause-list/refresh", "date=2026-11-05"));
        assertEquals("DELETE /x?a=1&b=2",
                InFlightRegistry.actionName("DELETE", "/api/x/", "b=2&empty=&a=1"));
        assertEquals("PUT /x?name=a b",
                InFlightRegistry.actionName("PUT", "/api/x", "name=a%20b"));
    }

    @Test
    void countsIdenticalCallsAndForgetsThemWhenAllFinished() {
        InFlightRegistry r = new InFlightRegistry();
        r.start("1", "POST /a");
        r.start("1", "POST /a");
        r.start("2", "POST /a");
        r.finish("1", "POST /a");
        assertEquals(1, r.of("1").size());
        r.finish("1", "POST /a");
        assertTrue(r.of("1").isEmpty());
        assertEquals(1, r.of("2").size());
    }
}
