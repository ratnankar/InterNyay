package com.internyay.repository;

import com.internyay.entity.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Messages of the saved chats
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    // All messages of one chat, oldest first
    List<ChatMessage> findByConversationIdOrderByIdAsc(Long conversationId);
}
