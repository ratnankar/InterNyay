package com.internyay.dto;

import java.time.LocalDateTime;

// One saved chat message sent to the chat widget
public record ChatHistoryItemDto(Long id, String role, String content, String action, LocalDateTime createdAt) {}
