package com.internyay.dto;

import java.time.LocalDateTime;

// One saved chat in the chat list
public record ChatConversationDto(Long id, String title, LocalDateTime createdAt, LocalDateTime updatedAt) {}
