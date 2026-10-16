package com.internyay.util;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

// Court preferences are stored as a comma separated list of court ids
class CourtPreferencesTest {

    @Test
    void parsesIdsInTheSavedOrder() {
        assertThat(CourtPreferences.parse("12,15,3")).containsExactly(12L, 15L, 3L);
    }

    @Test
    void emptyOrMissingValueGivesNoIds() {
        assertThat(CourtPreferences.parse(null)).isEmpty();
        assertThat(CourtPreferences.parse("")).isEmpty();
        assertThat(CourtPreferences.parse("   ")).isEmpty();
    }

    @Test
    void dropsDuplicatesAndDamagedParts() {
        assertThat(CourtPreferences.parse("4, 4 ,x,,7")).containsExactly(4L, 7L);
    }

    @Test
    void joinRoundTripsAndEmptyBecomesNull() {
        assertThat(CourtPreferences.join(List.of(5L, 2L))).isEqualTo("5,2");
        assertThat(CourtPreferences.parse(CourtPreferences.join(List.of(5L, 2L)))).containsExactly(5L, 2L);
        assertThat(CourtPreferences.join(List.of())).isNull();
        assertThat(CourtPreferences.join(null)).isNull();
    }
}
