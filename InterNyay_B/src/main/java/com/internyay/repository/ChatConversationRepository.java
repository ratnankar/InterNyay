package com.internyay.repository;

import com.internyay.entity.ChatConversation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

// Saved chats of the AI assistant
public interface ChatConversationRepository extends JpaRepository<ChatConversation, Long> {

    // All chats of an account, latest first
    List<ChatConversation> findByAccountIdOrderByUpdatedAtDescIdDesc(Long accountId);

    // A chat, only if it belongs to this account
    Optional<ChatConversation> findByIdAndAccountId(Long id, Long accountId);

    // Removes every chat of an account (their messages go with them)
    void deleteByAccountId(Long accountId);
}
