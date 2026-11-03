package com.internyay.dto;

public record ChatResponse(String reply, Long conversationId, Long messageId, String action) {}
