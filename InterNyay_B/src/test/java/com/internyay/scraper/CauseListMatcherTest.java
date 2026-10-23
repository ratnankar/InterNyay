package com.internyay.scraper;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CauseListMatcherTest {

    private static final List<String> LINES = List.of(
            "COURT NO. 04",
            "HON'BLE MS. JUSTICE EXAMPLE",
            "1. W.P.(C) 1234/2024 RAM KUMAR vs UNION OF INDIA",
            "CM APPL. 5555/2024",
            "2.  CS(OS) 77/2020 ABC LTD vs XYZ LTD",
            "3",
            "CRL.M.C. 910/2023 STATE vs SOMEONE",
            "14. BAIL APPLN. 3001/",
            "2024 SOME PERSON vs STATE",
            "15. FAO(OS) (COMM) 12/2022 A vs B");

    private final CauseListMatcher matcher = new CauseListMatcher(LINES);

    @Test
    void findsItemOnSameLine() {
        assertEquals(Optional.of(1), matcher.findItemNo("W.P.(C) 1234/2024"));
        assertEquals(Optional.of(2), matcher.findItemNo("CS (OS) 77 / 2020"));
    }

    @Test
    void ignoresDifferentFormattingOfTheCaseNumber() {
        assertEquals(Optional.of(1), matcher.findItemNo("wp(c) 1234/2024"));
        assertEquals(Optional.of(15), matcher.findItemNo("FAO (OS)(COMM) 12/2022"));
    }

    @Test
    void findsItemNumberOnPreviousLine() {
        assertEquals(Optional.of(3), matcher.findItemNo("CRL.M.C. 910/2023"));
    }

    @Test
    void findsCaseNumberSplitAcrossLines() {
        assertEquals(Optional.of(14), matcher.findItemNo("BAIL APPLN. 3001/2024"));
    }

    @Test
    void doesNotMatchApplicationsOrOtherYears() {
        assertTrue(matcher.findItemNo("CM APPL. 5555/2024").isEmpty());
        assertTrue(matcher.findItemNo("W.P.(C) 1234/2023").isEmpty());
        assertTrue(matcher.findItemNo("W.P.(C) 234/2024").isEmpty());
    }

    @Test
    void rejectsNumbersWithoutTypeOrYear() {
        assertTrue(matcher.findItemNo("1234/2024").isEmpty());
        assertTrue(matcher.findItemNo("WPC1234").isEmpty());
        assertTrue(matcher.findItemNo(null).isEmpty());
    }
}
