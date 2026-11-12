package com.internyay.service.chat;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.internyay.dto.ClientRequest;
import com.internyay.dto.HearingRequest;
import com.internyay.dto.MiscApplicationDto;
import com.internyay.dto.NextHearingRequest;
import com.internyay.entity.Case;
import com.internyay.entity.Client;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.ClientRepository;
import com.internyay.service.ClientService;
import com.internyay.service.MiscApplicationService;
import com.internyay.util.CaseStatuses;
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
    static final String NEXT_HEARING = "next_hearing";
    static final String CLIENT_CREATE = "client_create";
    static final String MISC_DISPOSE = "misc_dispose";

    private static final DateTimeFormatter SHORT_DATE = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
    private static final int MAX_TITLE = 200;
    private static final int MAX_NOTE = 1000;

    private record Pending(Long accountId, Long userId, String type, Map<String, Object> payload) {}

    private final TaskService taskService;
    private final TaskRepository taskRepo;
    private final HearingRepository hearingRepo;
    private final HearingService hearingService;
    private final CaseRepository caseRepo;
    private final ClientRepository clientRepo;
    private final ClientService clientService;
    private final MiscApplicationService miscService;

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

    // Sets the next hearing date of an open case, the date being closed goes to the hearing history
    public Map<String, Object> proposeNextHearing(ChatContext ctx, Long caseId, LocalDate date, String outcome, String notes) {
        if (caseId == null) throw new IllegalArgumentException("case_id is required");
        if (date == null) throw new IllegalArgumentException("date is required");
        Case c = caseRepo.findById(caseId).orElseThrow(() -> new IllegalArgumentException("No case with that id"));
        if (c.getUser() == null || !c.getUser().getId().equals(ctx.userId())) throw new IllegalArgumentException("No case with that id");
        if (CaseStatuses.isClosed(c.getStatus())) throw new IllegalArgumentException("That case is closed, so it has no next hearing to set.");
        if (date.isBefore(ChatTools.today())) throw new IllegalArgumentException("The new hearing date is in the past. Ask for a date from today onwards.");
        if (date.equals(c.getNextHearing())) throw new IllegalArgumentException("The case already has this next hearing date.");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("caseId", c.getId());
        payload.put("date", date.toString());
        payload.put("outcome", blankToNull(outcome));
        payload.put("notes", blankToNull(notes));

        List<String> lines = new java.util.ArrayList<>();
        lines.add("Case: " + c.getTitle() + (c.getCaseNo() == null ? "" : " (" + c.getCaseNo() + ")"));
        if (c.getNextHearing() != null) lines.add("Current next hearing: " + c.getNextHearing().format(SHORT_DATE) + " (saved to the hearing history)");
        lines.add("New next hearing: " + date.format(SHORT_DATE));
        if (blankToNull(outcome) != null) lines.add("Outcome of the last hearing: " + outcome.trim());
        if (blankToNull(notes) != null) lines.add("Note: " + notes.trim());
        return register(ctx, NEXT_HEARING, payload, "Set this next hearing date?", "Set date", lines);
    }

    // Adds a client
    public Map<String, Object> proposeClient(ChatContext ctx, String name, String email, String phone, String address, String type, String label) {
        String cleanName = requireText(name, "name", 150);
        String cleanEmail = blankToNull(email);
        if (cleanEmail != null && !cleanEmail.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) throw new IllegalArgumentException("That email address is not valid.");
        String cleanPhone = blankToNull(phone);
        if (cleanPhone != null && !cleanPhone.matches("^(\\+91[\\s-]?|0)?[6-9]\\d{9}$")) throw new IllegalArgumentException("Enter a valid 10-digit Indian mobile number.");
        String cleanType = blankToNull(type);
        if (cleanType != null) Client.ClientType.fromValue(cleanType);
        String cleanLabel = blankToNull(label);
        if (cleanLabel != null) Client.CustomLabel.fromValue(cleanLabel);

        boolean exists = clientRepo.findByUser_Id(ctx.userId()).stream().anyMatch(c -> c.getName() != null && c.getName().trim().equalsIgnoreCase(cleanName));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("name", cleanName);
        payload.put("email", cleanEmail);
        payload.put("phone", cleanPhone);
        payload.put("address", blankToNull(address));
        payload.put("type", cleanType);
        payload.put("label", cleanLabel);

        List<String> lines = new java.util.ArrayList<>();
        lines.add("Client: " + cleanName);
        if (cleanType != null) lines.add("Type: " + cleanType);
        if (cleanLabel != null) lines.add("Label: " + cleanLabel);
        if (cleanEmail != null) lines.add("Email: " + cleanEmail);
        if (cleanPhone != null) lines.add("WhatsApp phone: " + cleanPhone);
        if (blankToNull(address) != null) lines.add("Address: " + address.trim());
        if (exists) lines.add("Note: a client with this name already exists.");
        return register(ctx, CLIENT_CREATE, payload, "Add this client?", "Add client", lines);
    }

    // Disposes a pending misc. application as Allowed or Disallowed
    public Map<String, Object> proposeMiscDisposal(ChatContext ctx, Long id, String outcome, LocalDate disposedOn) {
        if (id == null) throw new IllegalArgumentException("application_id is required");
        MiscApplicationDto a = miscService.get(id, ctx.userId());
        if (!"Pending".equalsIgnoreCase(a.status)) throw new IllegalArgumentException("That application is already disposed off.");
        String result = outcome == null ? "" : outcome.trim();
        if (!result.equalsIgnoreCase("Allowed") && !result.equalsIgnoreCase("Disallowed")) throw new IllegalArgumentException("outcome must be Allowed or Disallowed");
        result = result.equalsIgnoreCase("Allowed") ? "Allowed" : "Disallowed";
        if (disposedOn != null && disposedOn.isAfter(ChatTools.today())) throw new IllegalArgumentException("The disposal date cannot be in the future.");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", a.id);
        payload.put("outcome", result);
        payload.put("date", disposedOn == null ? null : disposedOn.toString());

        List<String> lines = new java.util.ArrayList<>();
        lines.add("Application: " + (a.applicationType == null ? "Misc. application" : a.applicationType));
        lines.add("Case: " + a.caseTitle + (a.caseNo == null ? "" : " (" + a.caseNo + ")"));
        lines.add("Outcome: " + result);
        if (disposedOn != null) lines.add("Disposed on: " + disposedOn.format(SHORT_DATE));
        return register(ctx, MISC_DISPOSE, payload, "Mark this application as disposed off?", "Dispose off", lines);
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
            case NEXT_HEARING -> moveNextHearing(p);
            case CLIENT_CREATE -> createClient(p);
            case MISC_DISPOSE -> disposeMisc(p);
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

    private String moveNextHearing(Pending p) {
        Long caseId = (Long) p.payload().get("caseId");
        NextHearingRequest req = new NextHearingRequest();
        req.setNextHearing(LocalDate.parse((String) p.payload().get("date")));
        req.setOutcome((String) p.payload().get("outcome"));
        req.setNotes((String) p.payload().get("notes"));
        hearingService.moveNextHearing(caseId, req, p.userId());
        return "Next hearing date updated.";
    }

    private String createClient(Pending p) {
        ClientRequest req = new ClientRequest();
        req.name = (String) p.payload().get("name");
        req.email = (String) p.payload().get("email");
        req.whatsappPhone = (String) p.payload().get("phone");
        req.address = (String) p.payload().get("address");
        req.type = (String) p.payload().get("type");
        req.customLabel = (String) p.payload().get("label");
        clientService.create(req, p.userId());
        return "Client added.";
    }

    private String disposeMisc(Pending p) {
        miscService.dispose((Long) p.payload().get("id"), (String) p.payload().get("date"), (String) p.payload().get("outcome"), p.userId());
        return "Application marked as disposed off.";
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
