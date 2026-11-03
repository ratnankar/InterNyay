package com.internyay.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.dto.ChatConversationDetailDto;
import com.internyay.dto.ChatConversationDto;
import com.internyay.dto.ChatFeedbackRequest;
import com.internyay.dto.ChatHistoryAppendRequest;
import com.internyay.dto.ChatHistoryAppendResponse;
import com.internyay.dto.ChatRequest;
import com.internyay.dto.ChatResponse;
import com.internyay.dto.ChatStatusDto;
import com.internyay.entity.User;
import com.internyay.exception.ChatUnavailableException;
import com.internyay.service.CourtPreferenceService;
import com.internyay.service.PlanService;
import com.internyay.service.chat.ChatActions;
import com.internyay.service.chat.ChatBriefService;
import com.internyay.service.chat.ChatContext;
import com.internyay.service.chat.ChatHistoryService;
import com.internyay.service.chat.ChatInsightsService;
import com.internyay.service.chat.ChatService;
import com.internyay.service.chat.ChatStreamListener;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chatService;
    private final ChatHistoryService historyService;
    private final ChatBriefService briefService;
    private final ChatInsightsService insights;
    private final ChatActions actions;
    private final AuthHelper auth;
    private final PlanService planService;
    private final CourtPreferenceService courtPreferenceService;
    private final ObjectMapper mapper;
    private final long streamTimeoutMs;
    private final Semaphore slots;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public ChatController(ChatService chatService, ChatHistoryService historyService, ChatBriefService briefService,
                          ChatInsightsService insights, ChatActions actions, AuthHelper auth, PlanService planService,
                          CourtPreferenceService courtPreferenceService, ObjectMapper mapper,
                          @Value("${internyay.chat.timeout-seconds:120}") int timeoutSeconds,
                          @Value("${internyay.chat.max-concurrent:12}") int maxConcurrent) {
        this.chatService = chatService;
        this.historyService = historyService;
        this.briefService = briefService;
        this.insights = insights;
        this.actions = actions;
        this.auth = auth;
        this.planService = planService;
        this.courtPreferenceService = courtPreferenceService;
        this.mapper = mapper;
        this.streamTimeoutMs = (timeoutSeconds + 60L) * 1000L;
        this.slots = new Semaphore(Math.max(1, maxConcurrent));
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    @GetMapping("/status")
    public ResponseEntity<ChatStatusDto> status() {
        return ResponseEntity.ok(new ChatStatusDto(chatService.isEnabled()));
    }

    @PostMapping
    public ResponseEntity<ChatResponse> chat(@Valid @RequestBody ChatRequest request) {
        User account = auth.currentAccount();
        ChatContext ctx = context(account);
        String question = lastQuestion(request);

        long started = System.nanoTime();
        ChatService.Result result;
        try {
            result = chatService.reply(request, ctx, ChatStreamListener.NONE);
        } catch (ChatUnavailableException e) {
            insights.logFailure(account.getId(), request.conversationId(), question, "UNAVAILABLE", elapsedMs(started));
            throw e;
        }
        insights.logRun(account.getId(), request.conversationId(), question, result, elapsedMs(started));

        ChatHistoryService.Saved saved = save(account.getId(), request, result);
        return ResponseEntity.ok(new ChatResponse(result.text(), saved.conversationId(), saved.messageId(), result.action()));
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Valid @RequestBody ChatRequest request, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");

        User account = auth.currentAccount();
        ChatContext ctx = context(account);
        String question = lastQuestion(request);
        Long accountId = account.getId();

        SseEmitter emitter = new SseEmitter(streamTimeoutMs);
        SseListener listener = new SseListener(emitter);
        emitter.onCompletion(listener::cancel);
        emitter.onTimeout(listener::cancel);
        emitter.onError(e -> listener.cancel());

        if (!slots.tryAcquire()) {
            listener.send("error", Map.of("message", "The assistant is busy right now. Please try again in a moment."));
            emitter.complete();
            return emitter;
        }

        Runnable work = () -> {
            long started = System.nanoTime();
            try {
                ChatService.Result result = chatService.reply(request, ctx, listener);
                if (listener.cancelled() || ChatService.OUTCOME_CANCELLED.equals(result.outcome())) {
                    insights.logRun(accountId, request.conversationId(), question, result, elapsedMs(started));
                    return;
                }
                insights.logRun(accountId, request.conversationId(), question, result, elapsedMs(started));

                ChatHistoryService.Saved saved = save(accountId, request, result);
                Map<String, Object> done = new LinkedHashMap<>();
                done.put("reply", result.text());
                done.put("conversationId", saved.conversationId());
                done.put("messageId", saved.messageId());
                done.put("action", result.action());
                listener.send("done", done);
            } catch (ChatUnavailableException | IllegalArgumentException e) {
                insights.logFailure(accountId, request.conversationId(), question, "UNAVAILABLE", elapsedMs(started));
                listener.send("error", Map.of("message", e.getMessage() == null ? "The assistant is unavailable" : e.getMessage()));
            } catch (RuntimeException e) {
                log.error("Chat stream failed", e);
                insights.logFailure(accountId, request.conversationId(), question, "ERROR", elapsedMs(started));
                listener.send("error", Map.of("message", "The assistant ran into a problem. Please try again."));
            } finally {
                slots.release();
                emitter.complete();
            }
        };
        try {
            executor.execute(work);
        } catch (RuntimeException e) {
            // Could not start the work (server shutting down): give the slot back so it is not lost for good
            slots.release();
            listener.send("error", Map.of("message", "The assistant is unavailable right now. Please try again in a moment."));
            emitter.complete();
        }
        return emitter;
    }

    @GetMapping("/brief")
    public ResponseEntity<Map<String, Object>> brief() {
        return ResponseEntity.ok(briefService.brief(context(auth.currentAccount())));
    }

    @PostMapping("/messages/{id}/feedback")
    public ResponseEntity<Void> feedback(@PathVariable Long id, @Valid @RequestBody ChatFeedbackRequest request) {
        insights.rate(auth.currentAccountId(), id, request.rating(), request.note());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/actions/{id}/confirm")
    public ResponseEntity<Map<String, Object>> confirmAction(@PathVariable String id) {
        return ResponseEntity.ok(actions.confirm(id, auth.currentAccountId()));
    }

    @PostMapping("/actions/{id}/cancel")
    public ResponseEntity<Void> cancelAction(@PathVariable String id) {
        actions.cancel(id, auth.currentAccountId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/conversations")
    public ResponseEntity<List<ChatConversationDto>> conversations() {
        return ResponseEntity.ok(historyService.list(auth.currentAccountId()));
    }

    @GetMapping("/conversations/{id}")
    public ResponseEntity<ChatConversationDetailDto> conversation(@PathVariable Long id) {
        return ResponseEntity.ok(historyService.get(auth.currentAccountId(), id));
    }

    @DeleteMapping("/conversations/{id}")
    public ResponseEntity<Void> deleteConversation(@PathVariable Long id) {
        historyService.delete(auth.currentAccountId(), id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/conversations")
    public ResponseEntity<Void> deleteAllConversations() {
        historyService.clearAll(auth.currentAccountId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/history")
    public ResponseEntity<ChatHistoryAppendResponse> addToHistory(@Valid @RequestBody ChatHistoryAppendRequest request) {
        Long id = historyService.append(auth.currentAccountId(), request.conversationId(), request.messages());
        return ResponseEntity.ok(new ChatHistoryAppendResponse(id));
    }

    private ChatContext context(User account) {
        boolean feesHidden = auth.isAssociate()
                || (!account.isAdmin() && !planService.hasFeature(account, "transactions"));
        return new ChatContext(auth.currentUserId(), account.getId(), account.getName(), auth.isAssociate(), feesHidden,
                myCourts(account));
    }

    private ChatHistoryService.Saved save(Long accountId, ChatRequest request, ChatService.Result result) {
        try {
            List<ChatRequest.Message> sent = request.messages();
            ChatRequest.Message last = sent.get(sent.size() - 1);
            if (last != null && "user".equalsIgnoreCase(last.role()) && last.content() != null) {
                return historyService.appendExchange(accountId, request.conversationId(), last.content(), result.text(), result.action());
            }
        } catch (RuntimeException e) {
            log.warn("Could not save the chat history: {}", e.getMessage());
        }
        return new ChatHistoryService.Saved(request.conversationId(), null);
    }

    private static String lastQuestion(ChatRequest request) {
        List<ChatRequest.Message> sent = request.messages();
        ChatRequest.Message last = sent.get(sent.size() - 1);
        return last == null ? null : last.content();
    }

    private static long elapsedMs(long startedNanos) {
        return (System.nanoTime() - startedNanos) / 1_000_000L;
    }

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

    private final class SseListener implements ChatStreamListener {

        private final SseEmitter emitter;
        private final AtomicBoolean closed = new AtomicBoolean(false);

        SseListener(SseEmitter emitter) {
            this.emitter = emitter;
        }

        void cancel() {
            closed.set(true);
        }

        @Override
        public void status(String text) {
            send("status", Map.of("text", text));
        }

        @Override
        public void delta(String text) {
            send("delta", Map.of("text", text));
        }

        @Override
        public void reset() {
            send("reset", Map.of());
        }

        @Override
        public void action(Map<String, Object> card) {
            send("action", card);
        }

        @Override
        public boolean cancelled() {
            return closed.get();
        }

        synchronized void send(String event, Object data) {
            if (closed.get()) return;
            try {
                emitter.send(SseEmitter.event().name(event).data(mapper.writeValueAsString(data)));
            } catch (IOException | IllegalStateException e) {
                closed.set(true);
            }
        }
    }
}
