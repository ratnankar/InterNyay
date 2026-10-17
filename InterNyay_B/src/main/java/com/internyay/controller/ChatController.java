package com.internyay.controller;

import com.internyay.dto.ChatConversationDetailDto;
import com.internyay.dto.ChatConversationDto;
import com.internyay.dto.ChatHistoryAppendRequest;
import com.internyay.dto.ChatHistoryAppendResponse;
import com.internyay.dto.ChatRequest;
import com.internyay.dto.ChatResponse;
import com.internyay.dto.ChatStatusDto;
import com.internyay.entity.User;
import com.internyay.service.chat.ChatContext;
import com.internyay.service.chat.ChatHistoryService;
import com.internyay.service.chat.ChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// AI chat assistant that answers questions about the advocate's own data
@Slf4j
@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final ChatHistoryService historyService;
    private final AuthHelper auth;
    private final com.internyay.service.PlanService planService;
    private final com.internyay.service.CourtPreferenceService courtPreferenceService;

    // Tells the frontend whether the assistant is configured
    @GetMapping("/status")
    public ResponseEntity<ChatStatusDto> status() {
        return ResponseEntity.ok(new ChatStatusDto(chatService.isEnabled()));
    }

    // Send a message and get the assistant's reply. The question and reply are saved in the chat named by
    // request.conversationId (a new chat when empty); the response says which chat that is
    @PostMapping
    public ResponseEntity<ChatResponse> chat(@Valid @RequestBody ChatRequest request) {
        User account = auth.currentAccount();
        // Fees stay hidden from associates and from plans without the transactions feature, same as the case list
        boolean feesHidden = auth.isAssociate()
                || (!account.isAdmin() && !planService.hasFeature(account, "transactions"));
        ChatContext ctx = new ChatContext(auth.currentUserId(), account.getId(), account.getName(), auth.isAssociate(), feesHidden,
                myCourts(account));
        String reply = chatService.reply(request, ctx);
        Long conversationId = saveExchange(account.getId(), request, reply);
        return ResponseEntity.ok(new ChatResponse(reply, conversationId));
    }

    // The chat list of the signed-in account, latest chat first
    @GetMapping("/conversations")
    public ResponseEntity<List<ChatConversationDto>> conversations() {
        return ResponseEntity.ok(historyService.list(auth.currentAccountId()));
    }

    // One saved chat with its messages, oldest first
    @GetMapping("/conversations/{id}")
    public ResponseEntity<ChatConversationDetailDto> conversation(@PathVariable Long id) {
        return ResponseEntity.ok(historyService.get(auth.currentAccountId(), id));
    }

    // Deletes one saved chat
    @DeleteMapping("/conversations/{id}")
    public ResponseEntity<Void> deleteConversation(@PathVariable Long id) {
        historyService.delete(auth.currentAccountId(), id);
        return ResponseEntity.noContent().build();
    }

    // Deletes every saved chat of the signed-in account
    @DeleteMapping("/conversations")
    public ResponseEntity<Void> deleteAllConversations() {
        historyService.clearAll(auth.currentAccountId());
        return ResponseEntity.noContent().build();
    }

    // Adds messages to a saved chat (the built-in support answer, which is never sent to the AI); a new chat when no id is given
    @PostMapping("/history")
    public ResponseEntity<ChatHistoryAppendResponse> addToHistory(@Valid @RequestBody ChatHistoryAppendRequest request) {
        Long id = historyService.append(auth.currentAccountId(), request.conversationId(), request.messages());
        return ResponseEntity.ok(new ChatHistoryAppendResponse(id));
    }

    // Saves the question just answered and the reply. A failure here must never lose the answer (the chat id is then empty)
    private Long saveExchange(Long accountId, ChatRequest request, String reply) {
        try {
            List<ChatRequest.Message> sent = request.messages();
            ChatRequest.Message last = sent.get(sent.size() - 1);
            if (last != null && "user".equalsIgnoreCase(last.role()) && last.content() != null) {
                return historyService.appendExchange(accountId, request.conversationId(), last.content(), reply);
            }
        } catch (RuntimeException e) {
            log.warn("Could not save the chat history: {}", e.getMessage());
        }
        return request.conversationId();
    }

    // The courts this advocate works at (chosen ones, else where the cases are), most cases first. A failure here
    // must never stop the chat, so it simply means no court is known
    private List<String> myCourts(User account) {
        try {
            return courtPreferenceService.get(account, auth.currentUserId()).getEffective().stream()
                    .map(p -> p.getCourt())
                    .filter(c -> c != null && !c.isBlank())
                    .distinct()
                    .toList();
        } catch (RuntimeException e) {
            return List.of();
        }
    }
}
