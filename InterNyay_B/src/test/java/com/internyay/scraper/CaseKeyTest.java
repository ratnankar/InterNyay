package com.internyay.scraper;

import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CaseKeyTest {

    @Test
    void sameKeyForUserAndPortalFormats() {
        Optional<CaseKey> user = CaseKey.parse("CS (COMM) 123/2024");
        Optional<CaseKey> portal = CaseKey.parse("CS (COMM)/123/2024");

        assertEquals(Optional.of(new CaseKey("CSCOMM", 123, 2024)), user);
        assertEquals(user, portal);
    }

    @Test
    void dropsTrailingNoFromTheType() {
        assertEquals(Optional.of(new CaseKey("CC", 45, 2023)), CaseKey.parse("CC No. 45 / 2023"));
    }

    @Test
    void rejectsTextWithoutTypeOrYear() {
        assertTrue(CaseKey.parse("1234/2024").isEmpty());
        assertTrue(CaseKey.parse(null).isEmpty());
    }

    @Test
    void findsEveryCaseNumberInACell() {
        assertEquals(2, CaseKey.findAll("CS/10/2020 and CC/11/2021").size());
    }
}
