package com.internyay.dto;

// Which chat the messages were saved in (a new chat is created when none was given)
public record ChatHistoryAppendResponse(Long conversationId) {}
