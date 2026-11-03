package com.internyay.service.chat;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.dto.ChatRequest;
import lombok.extern.slf4j.Slf4j;
import jakarta.annotation.PreDestroy;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
@Slf4j
public class ChatEvalService {

    public record Case(String id, String question, List<String> expectAnyTool, Boolean expectNoTools,
                       List<String> mustContain, List<String> mustNotContain) {}

    private static final int ANSWER_CHARS = 400;
    private static final long PAUSE_MS = 4000;

    private final ChatService chatService;
    private final ObjectMapper mapper;

    public ChatEvalService(ChatService chatService, ObjectMapper mapper) {
        this.chatService = chatService;
        this.mapper = mapper;
    }

    public List<Case> cases() {
        try (InputStream in = new ClassPathResource("chat-eval.json").getInputStream()) {
            return mapper.readValue(in, new TypeReference<List<Case>>() {});
        } catch (IOException e) {
            throw new IllegalStateException("The test questions could not be read");
        }
    }

    // One test run at a time. It runs in the background, so the admin page can be refreshed or closed while it works:
    // the page asks for status() and shows the progress (or the finished results) again
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "chat-eval");
        t.setDaemon(true);
        return t;
    });
    private final Object lock = new Object();
    private Job job;

    private static final class Job implements ChatStreamListener {
        final long startedAt = System.currentTimeMillis();
        final AtomicBoolean cancel = new AtomicBoolean(false);
        final List<Map<String, Object>> results = new ArrayList<>();
        volatile boolean running = true;
        volatile int total;
        volatile int passed;
        volatile String current = "";
        volatile String error = "";
        volatile long finishedAt;

        @Override public void status(String text) {}
        @Override public void delta(String text) {}
        @Override public void reset() {}
        @Override public void action(Map<String, Object> card) {}
        @Override public boolean cancelled() { return cancel.get(); }
    }

    @PreDestroy
    void shutdown() {
        synchronized (lock) {
            if (job != null) job.cancel.set(true);
        }
        worker.shutdownNow();
    }

    // Starts a test run in the background. When one is already running nothing new starts and that run is reported
    public Map<String, Object> start(ChatContext ctx, Set<String> only) {
        List<Case> selected = cases().stream()
                .filter(c -> only == null || only.isEmpty() || only.contains(c.id()))
                .toList();
        synchronized (lock) {
            if (job != null && job.running) return status();
            Job started = new Job();
            started.total = selected.size();
            job = started;
            try {
                worker.execute(() -> runJob(started, ctx, selected));
            } catch (RuntimeException e) {
                started.running = false;
                started.error = "The test run could not be started";
                started.finishedAt = System.currentTimeMillis();
            }
            return status();
        }
    }

    // Asks the running test to stop after the question it is on
    public Map<String, Object> cancel() {
        synchronized (lock) {
            if (job != null && job.running) job.cancel.set(true);
            return status();
        }
    }

    // The latest run: still going, finished or stopped, with the results so far
    public Map<String, Object> status() {
        synchronized (lock) {
            Map<String, Object> out = new LinkedHashMap<>();
            if (job == null) {
                out.put("running", false);
                out.put("started", false);
                return out;
            }
            List<Map<String, Object>> copy;
            synchronized (job.results) {
                copy = new ArrayList<>(job.results);
            }
            out.put("started", true);
            out.put("running", job.running);
            out.put("cancelled", job.cancel.get());
            out.put("total", job.total);
            out.put("done", copy.size());
            out.put("passed", job.passed);
            out.put("failed", copy.size() - job.passed);
            out.put("current", job.running ? job.current : "");
            out.put("error", job.error);
            out.put("startedAt", job.startedAt);
            out.put("finishedAt", job.finishedAt);
            out.put("results", copy);
            return out;
        }
    }

    private void runJob(Job j, ChatContext ctx, List<Case> selected) {
        try {
            for (Case c : selected) {
                if (j.cancel.get()) break;
                if (!j.results.isEmpty() && !pause(j)) break;
                j.current = c.question();

                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", c.id());
                row.put("question", c.question());
                List<String> problems = new ArrayList<>();
                try {
                    ChatRequest request = new ChatRequest(List.of(new ChatRequest.Message("user", c.question())), null);
                    ChatService.Result result = chatService.reply(request, ctx, j, true);
                    if (ChatService.OUTCOME_CANCELLED.equals(result.outcome())) break;
                    row.put("tools", result.tools());
                    row.put("rounds", result.rounds());
                    row.put("outcome", result.outcome());
                    row.put("answer", result.text().length() > ANSWER_CHARS ? result.text().substring(0, ANSWER_CHARS) + "…" : result.text());
                    check(c, result, problems);
                } catch (RuntimeException e) {
                    problems.add("Failed: " + e.getMessage());
                }
                row.put("passed", problems.isEmpty());
                row.put("problems", problems);
                if (problems.isEmpty()) j.passed++;
                synchronized (j.results) {
                    j.results.add(row);
                }
            }
        } catch (RuntimeException e) {
            log.error("Chat test run failed", e);
            j.error = "The test run stopped because of a problem on the server";
        } finally {
            j.current = "";
            j.finishedAt = System.currentTimeMillis();
            j.running = false;
        }
    }

    // Waits between two questions (so the AI provider's rate limit is not hit). Returns false when the run was stopped meanwhile
    private boolean pause(Job j) {
        long until = System.currentTimeMillis() + PAUSE_MS;
        try {
            while (System.currentTimeMillis() < until) {
                if (j.cancel.get()) return false;
                Thread.sleep(200);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
        return !j.cancel.get();
    }

    private void check(Case c, ChatService.Result result, List<String> problems) {
        if (!ChatService.OUTCOME_OK.equals(result.outcome())) problems.add("Outcome was " + result.outcome());

        if (c.expectAnyTool() != null && !c.expectAnyTool().isEmpty()
                && c.expectAnyTool().stream().noneMatch(result.tools()::contains)) {
            problems.add("Expected one of the tools " + c.expectAnyTool() + " but used " + result.tools());
        }
        if (Boolean.TRUE.equals(c.expectNoTools()) && !result.tools().isEmpty()) {
            problems.add("Expected no lookups but used " + result.tools());
        }
        String answer = result.text().toLowerCase(Locale.ROOT);
        if (c.mustContain() != null) {
            for (String needle : c.mustContain()) {
                if (!answer.contains(needle.toLowerCase(Locale.ROOT))) problems.add("Answer is missing \"" + needle + "\"");
            }
        }
        if (c.mustNotContain() != null) {
            for (String needle : c.mustNotContain()) {
                if (answer.contains(needle.toLowerCase(Locale.ROOT))) problems.add("Answer should not contain \"" + needle + "\"");
            }
        }
    }
}
