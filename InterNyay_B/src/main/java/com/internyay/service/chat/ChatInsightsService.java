package com.internyay.service.chat;

import com.internyay.entity.ChatFeedback;
import com.internyay.entity.ChatMessage;
import com.internyay.entity.ChatRun;
import com.internyay.repository.ChatFeedbackRepository;
import com.internyay.repository.ChatMessageRepository;
import com.internyay.repository.ChatRunRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@Service
@Slf4j
public class ChatInsightsService {

    private static final int QUESTION_CHARS = 300;
    private static final int ANSWER_CHARS = 600;
    private static final int LIST_SIZE = 25;

    private final ChatRunRepository runRepo;
    private final ChatFeedbackRepository feedbackRepo;
    private final ChatMessageRepository messageRepo;
    private final boolean logQuestions;

    public ChatInsightsService(ChatRunRepository runRepo, ChatFeedbackRepository feedbackRepo, ChatMessageRepository messageRepo,
                               @Value("${internyay.chat.log-questions:true}") boolean logQuestions) {
        this.runRepo = runRepo;
        this.feedbackRepo = feedbackRepo;
        this.messageRepo = messageRepo;
        this.logQuestions = logQuestions;
    }

    public void logRun(Long accountId, Long conversationId, String question, ChatService.Result result, long latencyMs) {
        try {
            String q = !logQuestions || question == null ? null : question.length() > QUESTION_CHARS ? question.substring(0, QUESTION_CHARS) : question;
            String toolList = String.join(",", result.tools());
            runRepo.save(ChatRun.builder()
                    .accountId(accountId)
                    .conversationId(conversationId)
                    .question(q)
                    .tools(toolList.length() > 400 ? toolList.substring(0, 400) : toolList)
                    .rounds(result.rounds())
                    .latencyMs(latencyMs)
                    .promptTokens(result.promptTokens())
                    .completionTokens(result.completionTokens())
                    .outcome(result.outcome())
                    .build());
        } catch (RuntimeException e) {
            log.warn("Could not log the chat run: {}", e.getMessage());
        }
    }

    public void logFailure(Long accountId, Long conversationId, String question, String outcome, long latencyMs) {
        logRun(accountId, conversationId, question,
                new ChatService.Result("", null, List.of(), 0, null, null, outcome), latencyMs);
    }

    @Transactional
    public void rate(Long accountId, Long messageId, int rating, String note) {
        if (rating < -1 || rating > 1) throw new IllegalArgumentException("Rating must be -1, 0 or 1");
        ChatMessage message = messageRepo.findById(messageId)
                .filter(m -> m.getAccountId().equals(accountId) && ChatMessage.ASSISTANT.equals(m.getRole()))
                .orElseThrow(() -> new NoSuchElementException("Message not found"));

        ChatFeedback existing = feedbackRepo.findByMessageIdAndAccountId(message.getId(), accountId).orElse(null);
        if (rating == 0) {
            if (existing != null) feedbackRepo.delete(existing);
            return;
        }
        String cleanNote = note == null || note.isBlank() ? null : note.trim().length() > 500 ? note.trim().substring(0, 500) : note.trim();
        if (existing == null) {
            feedbackRepo.save(ChatFeedback.builder().accountId(accountId).messageId(message.getId()).rating(rating).note(cleanNote).build());
        } else {
            existing.setRating(rating);
            if (cleanNote != null || rating > 0) existing.setNote(cleanNote);
            existing.setUpdatedAt(LocalDateTime.now());
            feedbackRepo.save(existing);
        }
    }

    @Transactional(readOnly = true)
    public Map<String, Object> insights(int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(Math.max(1, Math.min(days, 365)));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", Math.max(1, Math.min(days, 365)));

        List<Object[]> totals = runRepo.totals(since);
        Object[] t = totals.isEmpty() ? new Object[]{0L, 0.0, 0L, 0L, 0.0} : totals.get(0);
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("runs", ((Number) t[0]).longValue());
        summary.put("averageSeconds", round(((Number) t[1]).doubleValue() / 1000.0));
        summary.put("promptTokens", ((Number) t[2]).longValue());
        summary.put("completionTokens", ((Number) t[3]).longValue());
        summary.put("averageRounds", round(((Number) t[4]).doubleValue()));
        out.put("summary", summary);

        Map<String, Long> outcomes = new LinkedHashMap<>();
        for (Object[] row : runRepo.countByOutcome(since)) outcomes.put(String.valueOf(row[0]), ((Number) row[1]).longValue());
        out.put("outcomes", outcomes);

        Map<String, Integer> toolCounts = new HashMap<>();
        for (String list : runRepo.toolLists(since)) {
            for (String tool : list.split(",")) if (!tool.isBlank()) toolCounts.merge(tool.trim(), 1, Integer::sum);
        }
        List<Map<String, Object>> topTools = new ArrayList<>();
        toolCounts.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey(Comparator.naturalOrder())))
                .limit(15)
                .forEach(e -> topTools.add(Map.of("tool", e.getKey(), "count", e.getValue())));
        out.put("topTools", topTools);

        Map<String, Long> votes = new LinkedHashMap<>();
        votes.put("up", feedbackRepo.countByRatingAndUpdatedAtGreaterThanEqual(1, since));
        votes.put("down", feedbackRepo.countByRatingAndUpdatedAtGreaterThanEqual(-1, since));
        out.put("votes", votes);

        out.put("failures", runRepo.failures(since, PageRequest.of(0, LIST_SIZE)).stream().map(r -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("when", r.getCreatedAt().toString());
            row.put("outcome", r.getOutcome());
            row.put("question", r.getQuestion());
            row.put("tools", r.getTools());
            return row;
        }).toList());

        out.put("answeredWithoutLookup", runRepo.withoutTools(since, PageRequest.of(0, LIST_SIZE)).stream().map(r -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("when", r.getCreatedAt().toString());
            row.put("question", r.getQuestion());
            return row;
        }).toList());

        List<Map<String, Object>> downvotes = new ArrayList<>();
        for (Object[] row : feedbackRepo.recentDownvotes(since, PageRequest.of(0, LIST_SIZE))) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("when", String.valueOf(row[2]));
            entry.put("note", row[1]);
            entry.put("answer", cut(String.valueOf(row[3]), ANSWER_CHARS));
            entry.put("question", row[4] == null ? null : cut(String.valueOf(row[4]), QUESTION_CHARS));
            downvotes.add(entry);
        }
        out.put("downvotes", downvotes);
        return out;
    }

    private static String cut(String s, int max) {
        return s.length() > max ? s.substring(0, max) + "…" : s;
    }

    private static double round(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
