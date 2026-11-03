package com.internyay.service.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ChatBriefService {

    private static final int MAX_ITEMS = 8;

    private final ChatTools tools;
    private final ObjectMapper mapper;

    public Map<String, Object> brief(ChatContext ctx) {
        LocalDate today = ChatTools.today();
        Map<String, Object> overview = run("dashboard_overview", mapper.createObjectNode(), ctx);

        List<Map<String, Object>> sections = new ArrayList<>();
        addHearings(sections, "Today's hearings", today, ctx);
        addHearings(sections, "Tomorrow's hearings", today.plusDays(1), ctx);

        Map<String, Object> overdue = run("list_tasks", mapper.createObjectNode().put("overdue_only", true), ctx);
        List<String> taskLines = new ArrayList<>();
        for (Map<String, Object> task : rows(overdue.get("tasks"))) {
            String due = text(task.get("dueDate"));
            taskLines.add(text(task.get("title")) + (due.isEmpty() ? "" : " (due " + due + ")"));
        }
        addSection(sections, "Overdue tasks", "alert", taskLines);

        List<String> attention = new ArrayList<>();
        long noNext = number(overview.get("casesWithoutNextHearing"));
        if (noNext > 0) attention.add(noNext + (noNext == 1 ? " open case has" : " open cases have") + " no next hearing date");
        if (!ctx.feesHidden() && overview.get("feesDue") != null) {
            attention.add("Fees due across your cases: " + overview.get("feesDue"));
        }
        addSection(sections, "Worth a look", "normal", attention);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("date", today.toString());
        out.put("openCases", number(overview.get("openCases")));
        out.put("sections", sections);
        out.put("empty", sections.isEmpty());
        return out;
    }

    private void addHearings(List<Map<String, Object>> sections, String title, LocalDate date, ChatContext ctx) {
        ObjectNode input = mapper.createObjectNode().put("date", date.toString());
        Map<String, Object> day = run("hearing_day_details", input, ctx);

        List<String> lines = new ArrayList<>();
        boolean leave = false;
        List<Map<String, Object>> detailed = rows(day.get("judgeAndLeaveDetails"));
        if (!detailed.isEmpty()) {
            for (Map<String, Object> row : detailed) {
                boolean onLeave = Boolean.TRUE.equals(row.get("judgeOnLeave"));
                leave |= onLeave;
                lines.add(describe(text(row.get("caseTitle")), text(row.get("caseNo")), text(row.get("court")),
                        text(row.get("courtNo")), text(row.get("judge")), onLeave));
            }
        } else {
            for (Map<String, Object> row : rows(day.get("casesListedOnDate"))) {
                lines.add(describe(text(row.get("title")), text(row.get("caseNo")), text(row.get("court")),
                        text(row.get("courtNo")), text(row.get("judge")), false));
            }
        }
        addSection(sections, title, leave ? "alert" : "normal", lines);
    }

    private static String describe(String title, String caseNo, String court, String courtNo, String judge, boolean onLeave) {
        StringBuilder sb = new StringBuilder(title.isEmpty() ? "Case" : title);
        if (!caseNo.isEmpty()) sb.append(" (").append(caseNo).append(')');
        List<String> where = new ArrayList<>();
        if (!court.isEmpty()) where.add(court);
        if (!courtNo.isEmpty()) where.add("Court " + courtNo);
        if (!where.isEmpty()) sb.append(" · ").append(String.join(", ", where));
        if (!judge.isEmpty()) sb.append(" · ").append(judge);
        if (onLeave) sb.append(" · judge on leave");
        return sb.toString();
    }

    private static void addSection(List<Map<String, Object>> sections, String title, String tone, List<String> lines) {
        if (lines.isEmpty()) return;
        Map<String, Object> section = new LinkedHashMap<>();
        section.put("title", title);
        section.put("tone", tone);
        section.put("items", lines.size() > MAX_ITEMS ? lines.subList(0, MAX_ITEMS) : lines);
        section.put("more", Math.max(0, lines.size() - MAX_ITEMS));
        sections.add(section);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String name, com.fasterxml.jackson.databind.JsonNode input, ChatContext ctx) {
        Object result = tools.execute(name, input, ctx);
        return result instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rows(Object value) {
        if (!(value instanceof List<?> list)) return List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : list) if (o instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
        return out;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static long number(Object value) {
        return value instanceof Number n ? n.longValue() : 0;
    }
}
