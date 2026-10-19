package com.internyay.util;

import com.internyay.entity.Hearing;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

// Which case hearing entries only exist because of an application's date (older versions)
class MiscHearingsTest {

    private static Hearing h(String notes, String outcome, String orderDocId) {
        return Hearing.builder().notes(notes).outcome(outcome).orderDocId(orderDocId).build();
    }

    @Test
    void anEntryWithOnlyApplicationLinesIsMiscOnly() {
        assertThat(MiscHearings.isMiscOnly(h("Misc. Application: Bail Application", null, null))).isTrue();
        assertThat(MiscHearings.isMiscOnly(h("misc application : Stay\nMisc. Application: Bail Application", null, null))).isTrue();
    }

    @Test
    void aRealNoteOutcomeOrOrderMakesItACaseHearing() {
        assertThat(MiscHearings.isMiscOnly(h("Arguments heard\nMisc. Application: Bail Application", null, null))).isFalse();
        assertThat(MiscHearings.isMiscOnly(h("Misc. Application: Bail Application", "Adjourned", null))).isFalse();
        assertThat(MiscHearings.isMiscOnly(h("Misc. Application: Bail Application", null, "doc-1"))).isFalse();
    }

    @Test
    void noNotesIsNotMiscOnly() {
        assertThat(MiscHearings.isMiscOnly(h(null, null, null))).isFalse();
        assertThat(MiscHearings.isMiscOnly(h("  ", null, null))).isFalse();
        assertThat(MiscHearings.isMiscOnly(null)).isFalse();
    }
}
