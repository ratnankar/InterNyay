package com.internyay.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

// One note saved from the Calendar app. The limits match the ones the app already applies
public record AppNoteRequest(
        @Size(max = 120) String title,
        @Size(max = 10000) String body,
        @Size(max = 60000) String ink,
        Boolean pinned,
        Long caseId,
        @Size(max = 500) String caseTitle,
        @NotNull Long createdAt,
        @NotNull Long updatedAt) {
}
