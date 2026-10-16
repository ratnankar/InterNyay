package com.internyay.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

// Conversation sent to the chat assistant, at most 60 messages
public record ChatRequest(@NotEmpty @Size(max = 60) List<Message> messages) {

    // One message, role is user or assistant
    public record Message(String role, String content) {}
}
