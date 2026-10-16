package com.internyay.controller;

import com.internyay.dto.ChatRequest;
import com.internyay.dto.ChatResponse;
import com.internyay.dto.ChatStatusDto;
import com.internyay.entity.User;
import com.internyay.service.chat.ChatContext;
import com.internyay.service.chat.ChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// AI chat assistant that answers questions about the advocate's own data
@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final AuthHelper auth;
    private final com.internyay.service.PlanService planService;
    private final com.internyay.service.CourtPreferenceService courtPreferenceService;

    // Tells the frontend whether the assistant is configured
    @GetMapping("/status")
    public ResponseEntity<ChatStatusDto> status() {
        return ResponseEntity.ok(new ChatStatusDto(chatService.isEnabled()));
    }

    // Send a message and get the assistant's reply
    @PostMapping
    public ResponseEntity<ChatResponse> chat(@Valid @RequestBody ChatRequest request) {
        User account = auth.currentAccount();
        // Fees stay hidden from associates and from plans without the transactions feature, same as the case list
        boolean feesHidden = auth.isAssociate()
                || (!account.isAdmin() && !planService.hasFeature(account, "transactions"));
        ChatContext ctx = new ChatContext(auth.currentUserId(), account.getId(), account.getName(), auth.isAssociate(), feesHidden,
                myCourts(account));
        return ResponseEntity.ok(new ChatResponse(chatService.reply(request, ctx)));
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
