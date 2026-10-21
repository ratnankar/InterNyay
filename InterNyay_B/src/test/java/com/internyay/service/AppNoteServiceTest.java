package com.internyay.service;

import com.internyay.dto.AppNoteDto;
import com.internyay.dto.AppNoteRequest;
import com.internyay.entity.AppNote;
import com.internyay.repository.AppNoteRepository;
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

// Calendar app notes: newest edit wins, deletions are kept as markers, everything is scoped to one account
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AppNoteServiceTest {

    @Mock AppNoteRepository repo;
    private AppNoteService service;

    @BeforeEach
    void setUp() {
        service = new AppNoteService(repo);
        when(repo.save(any(AppNote.class))).thenAnswer(i -> i.getArgument(0));
    }

    private static AppNoteRequest req(String title, long updatedAt) {
        return new AppNoteRequest(title, "body", null, false, null, null, 1000L, updatedAt);
    }

    private static AppNote stored(long updatedAt) {
        return AppNote.builder().accountId(7L).clientId("n1").title("old").body("old").createdAt(1000L).updatedAt(updatedAt).build();
    }

    @Test
    void newNoteIsCreatedForTheAccount() {
        when(repo.findByAccountIdAndClientId(7L, "n1")).thenReturn(Optional.empty());
        AppNoteDto out = service.save(7L, "n1", req("Hello", 2000L));
        assertThat(out.id()).isEqualTo("n1");
        assertThat(out.title()).isEqualTo("Hello");
        assertThat(out.deleted()).isFalse();
        verify(repo).save(any(AppNote.class));
    }

    @Test
    void newerEditReplacesTheStoredNote() {
        when(repo.findByAccountIdAndClientId(7L, "n1")).thenReturn(Optional.of(stored(2000L)));
        AppNoteDto out = service.save(7L, "n1", req("New", 3000L));
        assertThat(out.title()).isEqualTo("New");
        assertThat(out.updatedAt()).isEqualTo(3000L);
    }

    @Test
    void olderEditIsIgnoredAndTheStoredNoteIsReturned() {
        when(repo.findByAccountIdAndClientId(7L, "n1")).thenReturn(Optional.of(stored(5000L)));
        AppNoteDto out = service.save(7L, "n1", req("Stale", 3000L));
        assertThat(out.title()).isEqualTo("old");
        verify(repo, never()).save(any(AppNote.class));
    }

    @Test
    void caseTitleIsDroppedWhenNoCaseIsLinked() {
        when(repo.findByAccountIdAndClientId(7L, "n1")).thenReturn(Optional.empty());
        AppNoteDto out = service.save(7L, "n1", new AppNoteRequest("t", "b", null, true, null, "Some case", 1L, 2L));
        assertThat(out.caseTitle()).isNull();
        assertThat(out.pinned()).isTrue();
    }

    @Test
    void deleteLeavesAMarkerAndClearsTheContent() {
        AppNote n = stored(2000L);
        n.setInk("ink");
        when(repo.findByAccountIdAndClientId(7L, "n1")).thenReturn(Optional.of(n));
        AppNoteDto out = service.delete(7L, "n1", 4000L);
        assertThat(out.deleted()).isTrue();
        assertThat(out.body()).isEmpty();
        assertThat(out.ink()).isNull();
        assertThat(out.updatedAt()).isEqualTo(4000L);
    }

    @Test
    void deleteOfAnUnknownNoteStillLeavesAMarker() {
        when(repo.findByAccountIdAndClientId(7L, "n9")).thenReturn(Optional.empty());
        assertThat(service.delete(7L, "n9", 4000L).deleted()).isTrue();
    }

    @Test
    void deleteOlderThanTheLastEditKeepsTheNote() {
        when(repo.findByAccountIdAndClientId(7L, "n1")).thenReturn(Optional.of(stored(9000L)));
        assertThat(service.delete(7L, "n1", 4000L).deleted()).isFalse();
        verify(repo, never()).save(any(AppNote.class));
    }

    @Test
    void editAfterADeleteBringsTheNoteBack() {
        AppNote n = stored(2000L);
        n.setDeletedAt(2000L);
        when(repo.findByAccountIdAndClientId(7L, "n1")).thenReturn(Optional.of(n));
        assertThat(service.save(7L, "n1", req("Back", 3000L)).deleted()).isFalse();
    }

    @Test
    void rejectsABlankOrTooLongId() {
        assertThatThrownBy(() -> service.save(7L, " ", req("x", 1L))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.delete(7L, "x".repeat(65), 1L)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void stopsAtTheNoteLimit() {
        when(repo.findByAccountIdAndClientId(7L, "n1")).thenReturn(Optional.empty());
        when(repo.countByAccountId(7L)).thenReturn(2000L);
        assertThatThrownBy(() -> service.save(7L, "n1", req("x", 1L))).isInstanceOf(IllegalArgumentException.class);
    }
}
