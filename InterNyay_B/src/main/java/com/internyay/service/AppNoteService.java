package com.internyay.service;

import com.internyay.dto.AppNoteDto;
import com.internyay.dto.AppNoteRequest;
import com.internyay.entity.AppNote;
import com.internyay.repository.AppNoteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

// Private notes of the Calendar app. Every call is scoped to one account, so a note of someone else is never reachable.
// When the same note is saved from two phones, the newest edit (updatedAt) wins
@Service
@RequiredArgsConstructor
public class AppNoteService {

    private static final int MAX_NOTES_PER_ACCOUNT = 2000;

    private final AppNoteRepository repo;

    // Notes and deletions changed after "since" (epoch milliseconds, 0 for everything)
    @Transactional(readOnly = true)
    public List<AppNoteDto> changedSince(Long accountId, long since) {
        return repo.findByAccountIdAndUpdatedAtGreaterThanOrderByUpdatedAtAsc(accountId, Math.max(0, since))
                .stream().map(AppNoteDto::of).toList();
    }

    // Create or update one note. An older edit than the stored one is ignored and the stored note is returned,
    // so the app can see it lost and take the server's copy
    @Transactional
    public AppNoteDto save(Long accountId, String clientId, AppNoteRequest req) {
        String id = checkId(clientId);
        AppNote note = repo.findByAccountIdAndClientId(accountId, id).orElse(null);
        if (note == null) {
            if (repo.countByAccountId(accountId) >= MAX_NOTES_PER_ACCOUNT) {
                throw new IllegalArgumentException("You have reached the limit of " + MAX_NOTES_PER_ACCOUNT + " notes. Delete some to add more");
            }
            note = AppNote.builder().accountId(accountId).clientId(id).createdAt(req.createdAt()).build();
        } else if (note.getUpdatedAt() > req.updatedAt()) {
            return AppNoteDto.of(note);
        }
        note.setTitle(req.title() == null ? "" : req.title());
        note.setBody(req.body() == null ? "" : req.body());
        note.setInk(req.ink() == null || req.ink().isEmpty() ? null : req.ink());
        note.setPinned(Boolean.TRUE.equals(req.pinned()));
        note.setCaseId(req.caseId());
        note.setCaseTitle(req.caseId() == null ? null : req.caseTitle());
        note.setUpdatedAt(req.updatedAt());
        // Saving a note that was deleted earlier on another phone brings it back, because this edit is newer
        note.setDeletedAt(null);
        return AppNoteDto.of(repo.save(note));
    }

    // Delete one note. "at" is when the app deleted it; it is ignored if the stored note was edited after that.
    // Deleting a note the server never saw leaves a deletion marker, so a late upload of it cannot bring it back
    @Transactional
    public AppNoteDto delete(Long accountId, String clientId, long at) {
        String id = checkId(clientId);
        AppNote note = repo.findByAccountIdAndClientId(accountId, id).orElse(null);
        if (note == null) {
            note = AppNote.builder().accountId(accountId).clientId(id).title("").body("")
                    .createdAt(at).updatedAt(at).deletedAt(at).build();
            return AppNoteDto.of(repo.save(note));
        }
        if (note.getUpdatedAt() > at) return AppNoteDto.of(note);
        note.setTitle("");
        note.setBody("");
        note.setInk(null);
        note.setUpdatedAt(at);
        note.setDeletedAt(at);
        return AppNoteDto.of(repo.save(note));
    }

    private static String checkId(String clientId) {
        if (clientId == null || clientId.isBlank() || clientId.length() > 64) {
            throw new IllegalArgumentException("Invalid note id");
        }
        return clientId;
    }
}
