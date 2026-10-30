package com.internyay.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CaseTextTest {

    @Test
    void titleUsesVDotAndSingleSpaces() {
        assertEquals("State v. Naresh @Rohit", CaseText.normalizeTitle("State vs Naresh @Rohit"));
        assertEquals("Sapna v. Harsh Chauhan", CaseText.normalizeTitle("Sapna Vs. Harsh Chauhan"));
        assertEquals("Ankur & Varsha", CaseText.normalizeTitle("Ankur  & Varsha"));
    }

    @Test
    void capitalLetterAloneIsAnInitial() {
        assertEquals("Rajesh V. Kumar v. State", CaseText.normalizeTitle("Rajesh V. Kumar v. State"));
    }

    @Test
    void titleInCapitalsGetsNormalCase() {
        assertEquals("State v. Asheesh Thakur Ors.", CaseText.normalizeTitle("STATE v. ASHEESH THAKUR ORS."));
        assertEquals("Sri Sai Polyblend Pvt. Ltd. v. Saididdi Engineering Company",
                CaseText.normalizeTitle("SRI SAI POLYBLEND PVT. LTD v. SAIDIDDI ENGINEERING COMPANY"));
    }

    @Test
    void caseNumberHasOneFormat() {
        assertEquals("CR Cases 6871/2025", CaseText.normalizeCaseNo("CR Cases/6871/2025"));
        assertEquals("SC 466/2023", CaseText.normalizeCaseNo("SC/466/2023"));
        assertEquals("SC 170/2020", CaseText.normalizeCaseNo("SC 170/2020"));
        assertEquals("9898", CaseText.normalizeCaseNo("9898"));
    }

    @Test
    void actsLoseTheTextOfOtherTables() {
        assertEquals("Civil Procedure Code 1908 - Section 104 CPC & U/o. 43",
                CaseText.cleanActs("Civil Procedure Code 1908 - Section 104 CPC &amp; U/o. 43; Processes; Process ID - Section Process Title; X_1_5"));
        assertEquals("IPC - Section 307", CaseText.cleanActs("IPC - Section 307; IA Status; IA Number - Section Party Name"));
        assertEquals("IPC - Section 457,380,411,34", CaseText.cleanActs("IPC - Section 457,380,411,34,"));
        assertEquals("BNS - Section 74; POCSO - Section 10", CaseText.cleanActs("BNS - Section 74,; POCSO - Section 10,"));
    }

    @Test
    void stageLosesTheCourtKindAndNameKeyIgnoresSpaces() {
        assertEquals("Misc./Appearance", CaseText.normalizeStage("Misc./ Appearance (Criminal)"));
        assertEquals(CaseText.nameKey("Govind Puri"), CaseText.nameKey("Govindpuri"));
    }

    @Test
    void stageCapitalsAreTheSameWhoeverWroteThem() {
        assertEquals("Misc. Cases", CaseText.normalizeStage("Misc. cases"));
        assertEquals("Arguments on Charge", CaseText.normalizeStage("Argument On Charge"));
        assertEquals("Final Arguments", CaseText.normalizeStage("Final Arguments (Criminal)"));
        assertEquals("Defendant/Respondent Evidence", CaseText.normalizeStage("Defendant/Respondent Evidence"));
    }

    @Test
    void firNumberIgnoresSpacesAroundTheSlash() {
        assertEquals("727/2021", CaseText.normalizeFirNo(" 727 / 2021 "));
        assertEquals("00727", CaseText.normalizeFirNo("00727"));
    }

    @Test
    void actsTypedByHandGetTheFormOfThePortal() {
        assertEquals("IPC - Section 457,380,411,34", CaseText.cleanActs("457/380/411/34 of IPC"));
        assertEquals("IPC - Section 376,342,506; POCSO Act - Section 6", CaseText.cleanActs("376/342/506 of IPC & 6 POCSo Act"));
        assertEquals("BNS - Section 351(2),115(2),126(2),3(5)", CaseText.cleanActs("351(2)/115(2)/126(2)/3(5) of BNS"));
        assertEquals("NDPS Act - Section 20,61,85", CaseText.cleanActs("20/61/85 of NDPS Act"));
    }

    @Test
    void actsFromThePortalAreCleaned() {
        assertEquals("IPC - Section 457,380,411,34", CaseText.cleanActs("IPC - Section 457,380,411,34,"));
        assertEquals("IPC - Section 379,411", CaseText.cleanActs("IPC - Section 379/411"));
        assertEquals("Negotiable Instruments Act - Section 138",
                CaseText.cleanActs("Negotiable Instruments Act - Section 138,N,I,ACT,; Processes; Process ID - Section Process Title"));
        // Free text sections are left alone
        assertEquals("Civil Procedure Code 1908 - Section 104 CPC & U/o. 43 Rule 1(3) R/w. Sec. 151 CPC",
                CaseText.cleanActs("Civil Procedure Code 1908 - Section 104 CPC &amp; U/o. 43 Rule 1(3) R/w. Sec. 151 CPC; Processes; Process ID -"));
        assertEquals("DLST020024582015", CaseText.cleanActs("DLST020024582015"));
    }
}
