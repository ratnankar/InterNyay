package com.internyay.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class EcourtsCaseNatureTest {

    // A BNSS complaint case: the act is spelt out, no FIR
    @Test
    void bnssComplaintCaseIsCriminal() {
        assertEquals("Criminal", EcourtsCaseService.natureOf(
                "CT Cases - COMPLAINT CASES Bharatiya Nagarik Suraksha Sanhita - Section 175(3)", false));
    }
}
