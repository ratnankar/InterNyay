package com.internyay.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CourtMatchTest {

    @Test
    void sameJudgeIgnoresTitlesCaseAndOrder() {
        assertTrue(CourtMatch.sameJudge("Sh. Rajesh Kumar", "RAJESH KUMAR"));
        assertTrue(CourtMatch.sameJudge("Smt. Sarita Devi", "Devi Sarita"));
    }

    @Test
    void shorterNameIsNotAnotherJudge() {
        assertFalse(CourtMatch.sameJudge("Rajesh Kumar", "Rajesh Kumar Sharma"));
        assertFalse(CourtMatch.sameJudge("Kumar", "Rajesh Kumar"));
    }

    @Test
    void middleNameLeftOutIsADifferentJudge() {
        assertFalse(CourtMatch.sameJudge("Anil Sharma", "Anil Kumar Sharma"));
    }

    @Test
    void numeralsMustAgree() {
        assertTrue(CourtMatch.sameJudge("Rajesh Kumar (II)", "Rajesh Kumar-II"));
        assertFalse(CourtMatch.sameJudge("Rajesh Kumar (II)", "Rajesh Kumar (III)"));
        assertFalse(CourtMatch.sameJudge("Rajesh Kumar (II)", "Rajesh Kumar"));
    }

    @Test
    void sharedSurnameAloneDoesNotMatch() {
        assertFalse(CourtMatch.sameJudge("Akshay Kumar", "Abhishek Kumar"));
        assertFalse(CourtMatch.sameJudge("A. Kumar", "Abhishek Kumar"));
        assertFalse(CourtMatch.sameJudge("Kanika Handa", "Neha Handa"));
        assertFalse(CourtMatch.sameJudge("Rajesh Kumar", "Rajesh Singh"));
    }

    @Test
    void initialsAloneDoNotMatch() {
        assertFalse(CourtMatch.sameJudge("A. S.", "Anil Singh"));
        assertFalse(CourtMatch.sameJudge("R. Kumar", "Amit Singh"));
    }

    @Test
    void courtNumbersMatchLoosely() {
        assertTrue(CourtMatch.sameCourtNo("Court No. 05", "5"));
    }

    @Test
    void nameSearchIgnoresTitlesAndOrder() {
        assertTrue(CourtMatch.nameSearchMatches("Ms. Kanika Handa", "Kanika Handa"));
        assertTrue(CourtMatch.nameSearchMatches("handa kan", "Kanika Handa"));
        assertTrue(CourtMatch.nameSearchMatches("abhi", "Sh. Abhishek Kumar"));
        assertFalse(CourtMatch.nameSearchMatches("kumar kumar", "Abhishek Kumar"));
        assertFalse(CourtMatch.nameSearchMatches("rakesh", "Abhishek Kumar"));
    }
}
