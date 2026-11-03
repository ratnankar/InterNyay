package com.internyay.service.chat;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LegalKnowledgeTest {

    private static LegalKnowledge knowledge;

    @BeforeAll
    static void load() {
        knowledge = new LegalKnowledge("");
        knowledge.reload();
    }

    private static String top(String query) {
        List<LegalKnowledge.Passage> hits = knowledge.search(query, 3);
        assertFalse(hits.isEmpty(), query);
        return hits.get(0).title();
    }

    @Test
    void findsSectionMappings() {
        assertEquals("IPC section 420 is BNS section 318(4)", top("what is IPC 420 in BNS"));
        assertEquals("IPC section 498A is BNS section 85", top("498A cruelty"));
        assertEquals("CrPC section 438 is BNSS section 482", top("CrPC 438 anticipatory bail BNSS"));
        assertEquals("Evidence Act section 65B is BSA section 63", top("65B electronic evidence"));
    }

    @Test
    void findsProcedurePassages() {
        assertEquals("Default bail", top("default bail 60 days"));
        assertTrue(top("cheque bounce notice time limit").startsWith("Cheque dishonour"));
    }

    @Test
    void returnsNothingForUnrelatedQuestions() {
        assertTrue(knowledge.search("zzqx wibble", 3).isEmpty());
        assertTrue(knowledge.search("", 3).isEmpty());
    }

    @Test
    void parsesPassagesBySecondLevelHeading() {
        List<LegalKnowledge.Passage> hits = knowledge.search("section 5 condonation of delay appeal", 1);
        assertEquals("General practice notes", hits.get(0).source());
    }
}
