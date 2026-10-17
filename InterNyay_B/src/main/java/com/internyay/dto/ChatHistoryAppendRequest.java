package com.internyay.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

// Messages to add to a saved chat (used for the built-in support answer, which never reaches the AI).
// conversationId empty starts a new saved chat
public record ChatHistoryAppendRequest(@NotEmpty @Size(max = 4) List<Item> messages, Long conversationId) {

    // role is user or assistant; action is optional (for example "contact")
    public record Item(String role, String content, String action) {}
}
