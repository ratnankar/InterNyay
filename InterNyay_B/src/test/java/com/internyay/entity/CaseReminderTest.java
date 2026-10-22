package com.internyay.entity;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

// Automatic WhatsApp reminders need a client number, and start by themselves once one is added
class CaseReminderTest {

    private static Client client(String phone) {
        Client c = new Client();
        c.setWhatsapp_phone(phone);
        return c;
    }

    private static Case caseWith(Client main, Client... extra) {
        Case c = new Case();
        c.setClient(main);
        c.setAdditionalClients(new ArrayList<>(List.of(extra)));
        return c;
    }

    @Test
    void offWhenNoClientHasANumber() {
        assertFalse(caseWith(client(null)).isWhatsappRemindersEnabled());
        assertFalse(caseWith(client("  "), client("")).isWhatsappRemindersEnabled());
        assertFalse(caseWith(null).isWhatsappRemindersEnabled());
    }

    @Test
    void turnsOnByItselfWhenANumberIsAddedLater() {
        Client main = client(null);
        Case c = caseWith(main);
        assertFalse(c.isWhatsappRemindersEnabled());

        main.setWhatsapp_phone("9876543210");
        assertTrue(c.isWhatsappRemindersEnabled());
    }

    @Test
    void anAdditionalClientNumberIsEnough() {
        assertTrue(caseWith(client(null), client("9876543210")).isWhatsappRemindersEnabled());
    }

    @Test
    void explicitOffStaysOffEvenWithANumber() {
        Case c = caseWith(client("9876543210"));
        c.setWhatsappReminders(false);
        assertFalse(c.isWhatsappRemindersEnabled());
    }
}
