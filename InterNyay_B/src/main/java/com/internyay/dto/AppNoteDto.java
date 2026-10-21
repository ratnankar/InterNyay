package com.internyay.dto;

import com.internyay.entity.AppNote;

// A Calendar app note as sent to and from the app. deleted is true for a note that was removed
public record AppNoteDto(
        String id,
        String title,
        String body,
        String ink,
        boolean pinned,
        Long caseId,
        String caseTitle,
        long createdAt,
        long updatedAt,
        boolean deleted) {

    public static AppNoteDto of(AppNote n) {
        return new AppNoteDto(n.getClientId(), n.getTitle(), n.getBody(), n.getInk(), n.isPinned(),
                n.getCaseId(), n.getCaseTitle(), n.getCreatedAt(), n.getUpdatedAt(), n.getDeletedAt() != null);
    }
}
