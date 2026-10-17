package com.internyay.dto;

// Reply of the chat assistant, and the saved chat it belongs to (null if saving failed)
public record ChatResponse(String reply, Long conversationId) {}
