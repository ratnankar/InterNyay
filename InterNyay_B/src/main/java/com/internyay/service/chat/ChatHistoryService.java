package com.internyay.service.chat;

import com.internyay.dto.ChatConversationDetailDto;
import com.internyay.dto.ChatConversationDto;
import com.internyay.dto.ChatHistoryAppendRequest;
import com.internyay.dto.ChatHistoryItemDto;
import com.internyay.entity.ChatConversation;
import com.internyay.entity.ChatMessage;
import com.internyay.repository.ChatConversationRepository;
import com.internyay.repository.ChatMessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;

// Saves the chats of each account with the AI assistant, so they are still there after a refresh or on another device.
// An account can have many chats: the user starts a new one and opens earlier ones from the chat list.
@Service
@RequiredArgsConstructor
public class ChatHistoryService {

    // Nothing is deleted automatically: every chat and every message is kept until the user deletes the chat
    // (or the account is deleted), and a chat can hold any number of messages.
    // Longer messages are cut, so one huge paste cannot fill the table
    static final int MAX_CHARS = 8000;
    // Longest chat title
    static final int TITLE_CHARS = 60;
    // Button names the widget understands
    private static final Set<String> ACTIONS = Set.of("contact");

    private final ChatMessageRepository messageRepo;
    private final ChatConversationRepository conversationRepo;

    // The chat list of an account: all its chats, latest first
    @Transactional(readOnly = true)
    public List<ChatConversationDto> list(Long accountId) {
        return conversationRepo.findByAccountIdOrderByUpdatedAtDescIdDesc(accountId).stream()
                .map(c -> new ChatConversationDto(c.getId(), c.getTitle(), c.getCreatedAt(), c.getUpdatedAt()))
                .toList();
    }

    // One chat with its messages, oldest first. A chat of another account is reported as not found
    @Transactional(readOnly = true)
    public ChatConversationDetailDto get(Long accountId, Long conversationId) {
        ChatConversation c = conversationRepo.findByIdAndAccountId(conversationId, accountId)
                .orElseThrow(() -> new NoSuchElementException("Chat not found"));
        List<ChatHistoryItemDto> items = messageRepo.findByConversationIdOrderByIdAsc(c.getId()).stream()
                .map(m -> new ChatHistoryItemDto(m.getId(), m.getRole(), m.getContent(), m.getAction(), m.getCreatedAt()))
                .toList();
        return new ChatConversationDetailDto(c.getId(), c.getTitle(), items);
    }

    // Adds messages at the end of a chat (blank ones are skipped).
    // With no conversationId, or one that does not exist any more for this account, a new chat is started.
    // Returns the id of the chat the messages went into
    @Transactional
    public Long append(Long accountId, Long conversationId, List<ChatHistoryAppendRequest.Item> items) {
        List<ChatHistoryAppendRequest.Item> valid = new ArrayList<>();
        for (ChatHistoryAppendRequest.Item item : items) {
            if (item == null || item.content() == null || item.content().isBlank()) continue;
            String role = item.role() == null ? "" : item.role().toLowerCase();
            if (!ChatMessage.USER.equals(role) && !ChatMessage.ASSISTANT.equals(role)) {
                throw new IllegalArgumentException("Unknown message type");
            }
            valid.add(item);
        }
        if (valid.isEmpty()) return conversationId;

        ChatConversation chat = conversationId == null ? null
                : conversationRepo.findByIdAndAccountId(conversationId, accountId).orElse(null);
        if (chat == null) {
            chat = conversationRepo.save(ChatConversation.builder().accountId(accountId).title(titleFor(valid)).build());
        }

        for (ChatHistoryAppendRequest.Item item : valid) {
            String role = item.role().toLowerCase();
            String text = item.content().length() > MAX_CHARS ? item.content().substring(0, MAX_CHARS) : item.content();
            String action = ChatMessage.ASSISTANT.equals(role) && item.action() != null && ACTIONS.contains(item.action()) ? item.action() : null;
            messageRepo.save(ChatMessage.builder().accountId(accountId).conversationId(chat.getId()).role(role).content(text).action(action).build());
        }
        chat.setUpdatedAt(LocalDateTime.now());
        conversationRepo.save(chat);
        return chat.getId();
    }

    // Saves one question and its answer; returns the id of the chat
    @Transactional
    public Long appendExchange(Long accountId, Long conversationId, String question, String reply) {
        return append(accountId, conversationId, List.of(
                new ChatHistoryAppendRequest.Item(ChatMessage.USER, question, null),
                new ChatHistoryAppendRequest.Item(ChatMessage.ASSISTANT, reply, null)));
    }

    // Deletes one chat and its messages
    @Transactional
    public void delete(Long accountId, Long conversationId) {
        ChatConversation c = conversationRepo.findByIdAndAccountId(conversationId, accountId)
                .orElseThrow(() -> new NoSuchElementException("Chat not found"));
        conversationRepo.delete(c);
    }

    // Deletes every chat of an account
    @Transactional
    public void clearAll(Long accountId) {
        conversationRepo.deleteByAccountId(accountId);
    }

    // Title of a new chat: the first question, on one line and shortened
    private static String titleFor(List<ChatHistoryAppendRequest.Item> items) {
        for (ChatHistoryAppendRequest.Item item : items) {
            if (ChatMessage.USER.equalsIgnoreCase(item.role())) {
                String one = item.content().trim().replaceAll("\\s+", " ");
                return one.length() > TITLE_CHARS ? one.substring(0, TITLE_CHARS - 1).trim() + "…" : one;
            }
        }
        return "New chat";
    }
}
