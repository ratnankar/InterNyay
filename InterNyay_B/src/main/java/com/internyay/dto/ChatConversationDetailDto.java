package com.internyay.dto;

import java.util.List;

// One saved chat with its messages, oldest first
public record ChatConversationDetailDto(Long id, String title, List<ChatHistoryItemDto> messages) {}
