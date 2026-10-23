package com.internyay.scraper;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SupremeCourtCauseListMatcherTest {

    private static final List<String> LINES = List.of(
            "COURT NO. 1",
            "1 SLP(C) No. 13912/2024 RAM KUMAR vs UNION OF INDIA",
            "IA No. 5555/2024 - EXEMPTION FROM FILING O.T.",
            "2. W.P.(C) No. 1042/2026 ABC LTD vs XYZ LTD",
            "9",
            "CRL.A. No. 910/2023 STATE vs SOMEONE",
            "9.1",
            "CRL.A. No. 911/2023 STATE vs OTHER",
            "42.2 T.P.(C) No. 77/2022 A vs B",
            "14. Diary No. 37177-2026 SOME PERSON vs STATE",
            "15. C.A. No. 636-645/2023 FIRM vs FIRM",
            "16. SLP(C) No. 3001/",
            "2025 SPLIT NUMBER vs STATE");

    private final SupremeCourtCauseListMatcher matcher = new SupremeCourtCauseListMatcher(LINES);

    @Test
    void ignoresTheWordNoOnBothSides() {
        assertEquals(Optional.of(1), matcher.findItemNo("SLP(C) No. 13912/2024"));
        assertEquals(Optional.of(1), matcher.findItemNo("SLP(C) 13912/2024"));
        assertEquals(Optional.of(1), matcher.findItemNo("slp (c) no 13912 / 2024"));
        assertEquals(Optional.of(2), matcher.findItemNo("W.P.(C) 1042/2026"));
    }

    @Test
    void findsItemNumberOnPreviousLine() {
        assertEquals(Optional.of(9), matcher.findItemNo("CRL.A. 910/2023"));
    }

    @Test
    void connectedMatterReturnsTheWholeItemNumber() {
        assertEquals(Optional.of(9), matcher.findItemNo("CRL.A. No. 911/2023"));
        assertEquals(Optional.of(42), matcher.findItemNo("T.P.(C) 77/2022"));
    }

    @Test
    void matchesDiaryNumbersWrittenWithAHyphenOrSlash() {
        assertEquals(Optional.of(14), matcher.findItemNo("Diary No. 37177/2026"));
        assertEquals(Optional.of(14), matcher.findItemNo("Diary No. 37177-2026"));
    }

    @Test
    void matchesACaseInsideARange() {
        assertEquals(Optional.of(15), matcher.findItemNo("C.A. 636/2023"));
        assertEquals(Optional.of(15), matcher.findItemNo("C.A. No. 640/2023"));
        assertEquals(Optional.of(15), matcher.findItemNo("C.A. 645/2023"));
    }

    @Test
    void doesNotMatchOutsideTheRangeOrOtherYears() {
        assertTrue(matcher.findItemNo("C.A. 635/2023").isEmpty());
        assertTrue(matcher.findItemNo("C.A. 646/2023").isEmpty());
        assertTrue(matcher.findItemNo("C.A. 640/2022").isEmpty());
    }

    @Test
    void findsCaseNumberSplitAcrossLines() {
        assertEquals(Optional.of(16), matcher.findItemNo("SLP(C) No. 3001/2025"));
    }

    @Test
    void doesNotMatchApplicationsOrOtherNumbers() {
        assertTrue(matcher.findItemNo("IA 5555/2024").isEmpty());
        assertTrue(matcher.findItemNo("SLP(C) 912/2024").isEmpty());
        assertTrue(matcher.findItemNo("SLP(C) 3912/2024").isEmpty());
    }

    @Test
    void rejectsNumbersWithoutTypeOrYear() {
        assertTrue(matcher.findItemNo("13912/2024").isEmpty());
        assertTrue(matcher.findItemNo("SLPC13912").isEmpty());
        assertTrue(matcher.findItemNo(null).isEmpty());
    }
}
