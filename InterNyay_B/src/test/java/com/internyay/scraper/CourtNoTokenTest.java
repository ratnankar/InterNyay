package com.internyay.scraper;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CourtNoTokenTest {

    @Test
    void matchesPortalCourtTextToTheCaseCourtNo() {
        assertTrue(CourtNoToken.same("Court No. 14 - Sh. X, ADJ", "14"));
        assertTrue(CourtNoToken.same("014", "14"));
        assertTrue(CourtNoToken.same("Court No 7A", "7a"));
    }

    @Test
    void doesNotMatchOtherCourts() {
        assertFalse(CourtNoToken.same("140 - Sh. X", "14"));
        assertFalse(CourtNoToken.same("", ""));
    }
}
