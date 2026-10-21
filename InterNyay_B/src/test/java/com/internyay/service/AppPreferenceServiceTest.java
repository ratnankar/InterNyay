package com.internyay.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.dto.AppPreferenceDto;
import com.internyay.dto.AppPreferenceRequest;
import com.internyay.entity.AppPreference;
import com.internyay.repository.AppPreferenceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Calendar app preferences: newest change wins, only a JSON object of a sane size is kept, everything is scoped to one account
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AppPreferenceServiceTest {

    @Mock AppPreferenceRepository repo;
    private final ObjectMapper mapper = new ObjectMapper();
    private AppPreferenceService service;

    @BeforeEach
    void setUp() {
        service = new AppPreferenceService(repo, mapper);
        when(repo.save(any(AppPreference.class))).thenAnswer(i -> i.getArgument(0));
    }

    private AppPreferenceRequest req(String json, long updatedAt) throws Exception {
        return new AppPreferenceRequest(mapper.readTree(json), updatedAt);
    }

    private static AppPreference stored(String json, long updatedAt) {
        return AppPreference.builder().accountId(7L).data(json).updatedAt(updatedAt).build();
    }

    @Test
    void nothingSavedYetReadsAsEmpty() {
        when(repo.findByAccountId(7L)).thenReturn(Optional.empty());
        AppPreferenceDto out = service.get(7L);
        assertThat(out.data()).isNull();
        assertThat(out.updatedAt()).isZero();
    }

    @Test
    void firstSaveIsStoredForTheAccount() throws Exception {
        when(repo.findByAccountId(7L)).thenReturn(Optional.empty());
        AppPreferenceDto out = service.save(7L, req("{\"colours\":{\"Tis Hazari\":\"#112233\"}}", 2000L));
        assertThat(out.updatedAt()).isEqualTo(2000L);
        assertThat(out.data().get("colours").get("Tis Hazari").asText()).isEqualTo("#112233");
    }

    @Test
    void newerChangeReplacesTheStoredOne() throws Exception {
        when(repo.findByAccountId(7L)).thenReturn(Optional.of(stored("{\"a\":1}", 1000L)));
        AppPreferenceDto out = service.save(7L, req("{\"a\":2}", 2000L));
        assertThat(out.updatedAt()).isEqualTo(2000L);
        assertThat(out.data().get("a").asInt()).isEqualTo(2);
    }

    @Test
    void olderChangeIsIgnoredAndTheStoredOneComesBack() throws Exception {
        when(repo.findByAccountId(7L)).thenReturn(Optional.of(stored("{\"a\":1}", 3000L)));
        AppPreferenceDto out = service.save(7L, req("{\"a\":2}", 2000L));
        assertThat(out.updatedAt()).isEqualTo(3000L);
        assertThat(out.data().get("a").asInt()).isEqualTo(1);
        verify(repo, never()).save(any());
    }

    @Test
    void onlyAJsonObjectIsAccepted() throws Exception {
        assertThatThrownBy(() -> service.save(7L, req("[1,2]", 1000L))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.save(7L, req("\"text\"", 1000L))).isInstanceOf(IllegalArgumentException.class);
        verify(repo, never()).save(any());
    }

    @Test
    void anOversizedObjectIsRefused() throws Exception {
        String big = "{\"x\":\"" + "a".repeat(20001) + "\"}";
        assertThatThrownBy(() -> service.save(7L, req(big, 1000L))).isInstanceOf(IllegalArgumentException.class);
        verify(repo, never()).save(any());
    }
}
