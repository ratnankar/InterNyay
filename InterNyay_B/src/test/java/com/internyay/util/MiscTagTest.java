package com.internyay.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MiscTagTest {

    @Test
    void findsTheTagInTheCaseNumber() {
        assertTrue(MiscTag.in("MISC DJ 123/2024"));
        assertTrue(MiscTag.in("CRL MISC 45/2023"));
        assertTrue(MiscTag.in("misc. crl 9/2022"));
        assertTrue(MiscTag.in("MISC/12/2021"));
    }

    @Test
    void ignoresCaseNumbersWithoutTheTag() {
        assertFalse(MiscTag.in("CS DJ 123/2024"));
        assertFalse(MiscTag.in("MISCONDUCT 5/2020"));
        assertFalse(MiscTag.in(""));
        assertFalse(MiscTag.in(null));
    }
}
