package com.internyay.service.chat;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.internyay.dto.HearingRequest;
import com.internyay.dto.TaskRequest;
import com.internyay.entity.Hearing;
import com.internyay.entity.Task;
import com.internyay.repository.HearingRepository;
import com.internyay.repository.TaskRepository;
import com.internyay.service.HearingService;
import com.internyay.service.TaskService;
import com.internyay.util.TaskStatuses;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class ChatActions {

    static final String TASK_CREATE = "task_create";
    static final String TASK_COMPLETE = "task_complete";
    static final String HEARING_NOTE = "hearing_note";

    private static final DateTimeFormatter SHORT_DATE = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
    private static final int MAX_TITLE = 200;
    private static final int MAX_NOTE = 1000;

    private record Pending(Long accountId, Long userId, String type, Map<String, Object> payload) {}

    private final TaskService taskService;
    private final TaskRepository taskRepo;
    private final HearingRepository hearingRepo;
    private final HearingService hearingService;

    private final Cache<String, Pending> pending = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(15))
            .maximumSize(5000)
            .build();

    public Map<String, Object> proposeTask(ChatContext ctx, String title, String description, LocalDate due, String category) {
        String cleanTitle = requireText(title, "title", MAX_TITLE);
        if (due != null && due.isBefore(ChatTools.today())) {
            throw new IllegalArgumentException("The due date is in the past. Ask the user for a date from today onwards.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", cleanTitle);
        payload.put("description", blankToNull(description));
        payload.put("dueDate", due == null ? null : due.toString());
        payload.put("category", blankToNull(category));

        List<String> lines = new java.util.ArrayList<>();
        lines.add("Task: " + cleanTitle);
        if (due != null) lines.add("Due: " + due.format(SHORT_DATE));
        if (blankToNull(category) != null) lines.add("Category: " + category.trim());
        if (blankToNull(description) != null) lines.add("Details: " + description.trim());
        return register(ctx, TASK_CREATE, payload, "Create this task?", "Create task", lines);
    }

    public Map<String, Object> proposeTaskCompletion(ChatContext ctx, Long taskId) {
        Task task = ownedTask(taskId, ctx.userId());
        if (TaskStatuses.COMPLETED.equals(TaskStatuses.normalize(task.getStatus()))) {
            throw new IllegalArgumentException("That task is already completed.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taskId", task.getId());
        List<String> lines = new java.util.ArrayList<>();
        lines.add("Task: " + task.getTitle());
        if (task.getDueDate() != null) lines.add("Due: " + task.getDueDate().format(SHORT_DATE));
        return register(ctx, TASK_COMPLETE, payload, "Mark this task as completed?", "Mark completed", lines);
    }

    public Map<String, Object> proposeHearingNote(ChatContext ctx, Long hearingId, String note) {
        String cleanNote = requireText(note, "note", MAX_NOTE);
        Hearing hearing = ownedHearing(hearingId, ctx.userId());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("hearingId", hearing.getId());
        payload.put("note", cleanNote);
        List<String> lines = new java.util.ArrayList<>();
        lines.add("Case: " + hearing.getLegalCase().getTitle());
        lines.add("Hearing of " + hearing.getDate().format(SHORT_DATE));
        lines.add("Note to add: " + cleanNote);
        return register(ctx, HEARING_NOTE, payload, "Add this note to the hearing?", "Add note", lines);
    }

    @Transactional
    public Map<String, Object> confirm(String id, Long accountId) {
        Pending p = pending.getIfPresent(id);
        if (p == null || !p.accountId().equals(accountId)) {
            throw new IllegalArgumentException("This request has expired. Ask the assistant again.");
        }
        pending.invalidate(id);

        String message = switch (p.type()) {
            case TASK_CREATE -> createTask(p);
            case TASK_COMPLETE -> completeTask(p);
            case HEARING_NOTE -> addHearingNote(p);
            default -> throw new IllegalArgumentException("Unknown request");
        };
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("done", true);
        result.put("message", message);
        return result;
    }

    public void cancel(String id, Long accountId) {
        Pending p = pending.getIfPresent(id);
        if (p != null && p.accountId().equals(accountId)) pending.invalidate(id);
    }

    private String createTask(Pending p) {
        TaskRequest req = new TaskRequest();
        req.title = (String) p.payload().get("title");
        req.description = (String) p.payload().get("description");
        req.category = (String) p.payload().get("category");
        req.status = TaskStatuses.PENDING;
        String due = (String) p.payload().get("dueDate");
        req.dueDate = due == null ? null : LocalDate.parse(due);
        taskService.create(req, p.userId());
        return "Task added to your to-do list.";
    }

    private String completeTask(Pending p) {
        Long taskId = (Long) p.payload().get("taskId");
        ownedTask(taskId, p.userId());
        TaskRequest req = new TaskRequest();
        req.status = TaskStatuses.COMPLETED;
        taskService.update(taskId, req, p.userId());
        return "Task marked as completed.";
    }

    private String addHearingNote(Pending p) {
        Long hearingId = (Long) p.payload().get("hearingId");
        Hearing hearing = ownedHearing(hearingId, p.userId());
        String existing = hearing.getNotes() == null ? "" : hearing.getNotes().trim();
        String note = (String) p.payload().get("note");

        HearingRequest req = new HearingRequest();
        req.caseId = hearing.getLegalCase().getId();
        req.date = hearing.getDate();
        req.notes = existing.isEmpty() ? note : existing + "\n" + note;
        hearingService.update(hearingId, req, p.userId());
        return "Note added to the hearing.";
    }

    private Map<String, Object> register(ChatContext ctx, String type, Map<String, Object> payload, String title,
                                         String confirmLabel, List<String> lines) {
        String id = UUID.randomUUID().toString();
        pending.put(id, new Pending(ctx.accountId(), ctx.userId(), type, payload));

        Map<String, Object> card = new LinkedHashMap<>();
        card.put("type", "confirm");
        card.put("id", id);
        card.put("title", title);
        card.put("confirmLabel", confirmLabel);
        card.put("lines", lines);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", "awaiting_user_confirmation");
        result.put("message", "A confirmation card is now shown to the user. Tell them it is ready for them to confirm. Do not say it is done.");
        result.put("_action", card);
        return result;
    }

    private Task ownedTask(Long id, Long userId) {
        if (id == null) throw new IllegalArgumentException("task_id is required");
        Task task = taskRepo.findById(id).orElseThrow(() -> new IllegalArgumentException("No task with that id"));
        if (!task.getUser().getId().equals(userId)) throw new IllegalArgumentException("No task with that id");
        return task;
    }

    private Hearing ownedHearing(Long id, Long userId) {
        if (id == null) throw new IllegalArgumentException("hearing_id is required");
        Hearing hearing = hearingRepo.findById(id).orElseThrow(() -> new IllegalArgumentException("No hearing with that id"));
        if (!hearing.getUser().getId().equals(userId)) throw new IllegalArgumentException("No hearing with that id");
        return hearing;
    }

    private static String requireText(String value, String name, int max) {
        String text = blankToNull(value);
        if (text == null) throw new IllegalArgumentException(name + " is required");
        if (text.length() > max) throw new IllegalArgumentException(name + " is too long, keep it under " + max + " characters");
        return text;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
