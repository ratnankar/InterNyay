package com.internyay.service.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.internyay.dto.*;
import com.internyay.entity.*;
import com.internyay.repository.*;
import com.internyay.service.*;
import com.internyay.util.CaseStatuses;
import com.internyay.util.TaskStatuses;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

// The data tools the chat assistant can call, every tool only reads the asking advocate's own data
@Component
@RequiredArgsConstructor
public class ChatTools {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    // Result size limits so answers stay small
    private static final int DEFAULT_LIMIT = 25;
    private static final int MAX_LIMIT = 100;

    private final CaseRepository caseRepo;
    private final ClientRepository clientRepo;
    private final TaskRepository taskRepo;
    private final HearingRepository hearingRepo;
    private final HolidayRepository holidayRepo;
    private final DocumentService documentService;
    private final JudgeService judgeService;
    private final HearingService hearingService;
    private final HearingLeaveService hearingLeaveService;
    private final HearingDayService hearingDayService;
    private final FileNumberService fileNumberService;
    private final OfficeExpenseService expenseService;
    private final QuickAccessService quickAccessService;
    private final BailRosterService bailRosterService;
    private final DutyMagistrateService dutyMagistrateService;
    private final NotificationService notificationService;
    private final PoliceDirectoryService policeDirectoryService;
    private final DrtJurisdictionService drtService;
    private final ConsumerJurisdictionService consumerService;
    private final UserRepository userRepo;
    private final PlanService planService;
    private final LegalFormRepository legalFormRepo;

    // Today in court time
    public static LocalDate today() {
        return LocalDate.now(IST);
    }

    // Tool list sent to the model, fee tools are left out for associates
    public List<Map<String, Object>> definitions(boolean associate) {
        List<Map<String, Object>> tools = new ArrayList<>();

        tools.add(ToolSpec.of("dashboard_overview",
                        "Snapshot of the advocate's practice: case counts by status and nature, client count, hearings today/tomorrow/next 7 days, pending and overdue tasks"
                                + (associate ? "." : ", and total fees billed, received and due."))
                .build());

        tools.add(ToolSpec.of("search_cases",
                        "Find cases. Free-text query matches title, case no, file no, CNR no, party names, client names, court, district, court no, relief, case type, FIR no and police station. All filters are optional and combine.")
                .text("query", "Free text, e.g. a party name, case number, file number or CNR.")
                .text("status", "Exact status such as Pending, On Hold, Decided, Withdrawn.")
                .text("nature", "Civil or Criminal.")
                .text("court", "Court name contains, e.g. Saket, Rohini, Delhi High Court.")
                .text("district", "District contains, e.g. South, North West.")
                .text("court_no", "Court number, e.g. 12.")
                .number("client_id", "Only cases of this client id.")
                .date("hearing_from", "Next hearing on or after this date.")
                .date("hearing_to", "Next hearing on or before this date.")
                .flag("open_only", "True to leave out Decided and Withdrawn cases.")
                .number("limit", "Max rows, default 25, max 100.")
                .build());

        tools.add(ToolSpec.of("get_case",
                        "Full details of one case: parties, opposite party, court and judge, FIR or cheque details, description, clients with their roles, hearing history with notes and outcomes, documents"
                                + (associate ? "." : ", and the fee breakdown with amounts received and due."))
                .number("case_id", "Case id from search_cases.")
                .text("reference", "Alternative to case_id: exact case no, file no or CNR no.")
                .build());

        tools.add(ToolSpec.of("list_clients",
                        "Find clients by name, email, phone, type or label. Returns contact details and how many cases each has.")
                .text("query", "Name, email, phone or address text.")
                .text("type", "Client type, e.g. INDIVIDUAL, COMPANY, BANK.")
                .text("label", "Legal Aid, Pro Bono or Corporate Panel.")
                .number("limit", "Max rows, default 25, max 100.")
                .build());

        tools.add(ToolSpec.of("get_client",
                        "Full details of one client: contact details, every case with its status and next hearing, documents"
                                + (associate ? "." : ", and fees billed, received and due across their cases."))
                .number("client_id", "Client id from list_clients.")
                .text("name", "Alternative to client_id: client name.")
                .build());

        tools.add(ToolSpec.of("get_hearings",
                        "Hearings in a date range: scheduled next-hearing dates of cases and recorded hearing history entries with notes, outcome and judge.")
                .date("from", "Start date, defaults to today.")
                .date("to", "End date, defaults to 30 days after the start.")
                .number("case_id", "Limit to one case.")
                .build());

        tools.add(ToolSpec.of("hearing_day_details",
                        "For one date: every case listed that day with its judge, whether the judge is on leave, court no and cause list number.")
                .date("date", "The hearing date.").require("date")
                .build());

        if (!associate) {
            tools.add(ToolSpec.of("fee_overview",
                            "Fees across cases: billed, received and balance due per case, with totals. Use for outstanding payments, collections and client dues.")
                    .number("client_id", "Only this client's cases.")
                    .number("case_id", "Only this case.")
                    .flag("only_due", "True (default) to list only cases with a balance due.")
                    .number("limit", "Max rows, default 25, max 100.")
                    .build());
        }

        tools.add(ToolSpec.of("list_tasks",
                        "To-do list tasks with status, category and due date.")
                .text("status", "Pending, In Progress or Completed.")
                .flag("overdue_only", "True to list only tasks past their due date and not completed.")
                .build());

        tools.add(ToolSpec.of("list_expenses",
                        "Office expenses with amount, who submitted them and whether they are paid.")
                .flag("unpaid_only", "True to list only unpaid expenses.")
                .build());

        tools.add(ToolSpec.of("search_documents",
                        "Find uploaded documents, evidence and hearing orders by name, type, case or client.")
                .text("query", "Text in the document name or file name.")
                .text("type", "Document type, e.g. Order.")
                .number("case_id", "Documents of one case.")
                .number("client_id", "Documents of one client.")
                .number("limit", "Max rows, default 25, max 100.")
                .build());

        tools.add(ToolSpec.of("find_judges",
                        "Judges directory: name, designation, court and district, court room no, VC meeting id, court email, virtual court link, court reader and jurisdiction.")
                .text("query", "Part of the judge's name.")
                .text("court", "Court, e.g. Saket.")
                .text("district", "District.")
                .text("court_no", "Court room number.")
                .number("limit", "Max rows, default 25, max 100.")
                .build());

        tools.add(ToolSpec.of("judges_on_leave",
                        "Judges currently on leave and upcoming leave, with dates and reason.")
                .text("court", "Court filter.")
                .text("district", "District filter.")
                .build());

        tools.add(ToolSpec.of("holidays",
                        "Court holidays and the advocate's own no-hearing dates in a range.")
                .date("from", "Start date, defaults to today.")
                .date("to", "End date, defaults to 90 days after the start.")
                .build());

        tools.add(ToolSpec.of("bail_roster",
                        "Bail roster: judicial officers, police stations and agencies covered, link judges, validity dates.")
                .text("court", "Court filter.")
                .text("district", "District filter.")
                .text("query", "Text to match in officer or police station names.")
                .build());

        tools.add(ToolSpec.of("duty_magistrate",
                        "Duty magistrate roster: court room, judge, designation, working days, holidays and validity.")
                .text("court", "Court filter.")
                .text("district", "District filter.")
                .text("query", "Judge name text.")
                .build());

        tools.add(ToolSpec.of("notifications",
                        "Latest notifications and circulars from courts and bar associations.")
                .text("source", "Source contains, e.g. Supreme Court, Delhi Bar Council.")
                .text("query", "Text in title or message.")
                .number("limit", "Max rows, default 10, max 50.")
                .build());

        tools.add(ToolSpec.of("police_directory",
                        "Delhi police directory: stations with phone, email, address, PIN, ACP sub-division and district DCP. Search by station, area, PIN or ACP.")
                .text("query", "Station name, area, PIN or ACP name.").require("query")
                .number("limit", "Max stations, default 10, max 40.")
                .build());

        tools.add(ToolSpec.of("find_jurisdiction",
                        "Which Debts Recovery Tribunal or Consumer Commission covers a police station or area, with name, location and covered stations.")
                .text("kind", "DRT or CONSUMER.").require("kind")
                .text("query", "Police station or area name, or tribunal / commission name.")
                .build());

        tools.add(ToolSpec.of("my_plan",
                        "The advocate's subscription plan: name, price, associate seats used and allowed, the features it includes and the other plans they could switch to. Associates only see the plan name and its features.")
                .build());

        tools.add(ToolSpec.of("legal_forms",
                        "Legal forms library: the blank and fillable PDF forms with name, description and whether the form can be filled automatically from a case.")
                .text("query", "Text in the form name or description.")
                .number("limit", "Max rows, default 25, max 50.")
                .build());

        tools.add(ToolSpec.of("file_numbers",
                        "File number status: the next automatic file number, highest number in use and released numbers that can be reused.")
                .build());

        return tools;
    }

    // Runs a tool by name
    @Transactional(readOnly = true)
    public Object execute(String name, JsonNode raw, ChatContext ctx) {
        ToolInput in = new ToolInput(raw);

        return switch (name) {
            case "dashboard_overview" -> overview(ctx);
            case "search_cases" -> searchCases(in, ctx);
            case "get_case" -> getCase(in, ctx);
            case "list_clients" -> listClients(in, ctx);
            case "get_client" -> getClient(in, ctx);
            case "get_hearings" -> getHearings(in, ctx);
            case "hearing_day_details" -> hearingDay(in, ctx);
            case "fee_overview" -> feeOverview(in, ctx);
            case "list_tasks" -> listTasks(in, ctx);
            case "list_expenses" -> listExpenses(in, ctx);
            case "search_documents" -> searchDocuments(in, ctx);
            case "find_judges" -> findJudges(in);
            case "judges_on_leave" -> judgesOnLeave(in);
            case "holidays" -> holidays(in, ctx);
            case "bail_roster" -> bailRoster(in);
            case "duty_magistrate" -> dutyMagistrate(in);
            case "notifications" -> notifications(in);
            case "police_directory" -> policeDirectory(in);
            case "find_jurisdiction" -> jurisdiction(in);
            case "file_numbers" -> fileNumbers(ctx);
            case "my_plan" -> myPlan(ctx);
            case "legal_forms" -> legalForms(in, ctx);
            default -> throw new IllegalArgumentException("Unknown tool " + name);
        };
    }

    // Dashboard style summary: counts, today's and upcoming hearings
    private Object overview(ChatContext ctx) {
        LocalDate today = today();
        List<Case> cases = caseRepo.findByUser_Id(ctx.userId());
        List<Client> clients = clientRepo.findByUser_Id(ctx.userId());
        List<Task> tasks = taskRepo.findByUser_Id(ctx.userId());

        Map<String, Long> byStatus = cases.stream().collect(Collectors.groupingBy(
                c -> orDash(c.getStatus()), TreeMap::new, Collectors.counting()));
        Map<String, Long> byNature = cases.stream().collect(Collectors.groupingBy(
                c -> orDash(c.getCaseNature()), TreeMap::new, Collectors.counting()));

        List<Case> open = cases.stream().filter(c -> !CaseStatuses.isClosed(c.getStatus())).toList();

        Rec rec = Rec.of()
                .always("today", today)
                .always("totalCases", cases.size())
                .always("openCases", open.size())
                .always("totalClients", clients.size())
                .always("casesByStatus", byStatus)
                .always("casesByNature", byNature)
                .always("hearingsToday", hearingsOn(open, today))
                .always("hearingsTomorrow", hearingsOn(open, today.plusDays(1)))
                .always("hearingsNext7DaysCount", open.stream()
                        .filter(c -> c.getNextHearing() != null
                                && !c.getNextHearing().isBefore(today)
                                && !c.getNextHearing().isAfter(today.plusDays(7))).count())
                .always("casesWithoutNextHearing", open.stream().filter(c -> c.getNextHearing() == null).count())
                .always("pendingTasks", tasks.stream().filter(t -> !isCompleted(t)).count())
                .always("overdueTasks", tasks.stream().filter(t -> isOverdue(t, today)).count());

        if (!ctx.feesHidden()) {
            BigDecimal billed = BigDecimal.ZERO;
            BigDecimal received = BigDecimal.ZERO;
            for (Case c : cases) {
                FeeSummary f = FeeSummary.of(c);
                billed = billed.add(f.total());
                received = received.add(f.paid());
            }
            rec.always("feesBilled", billed)
                    .always("feesReceived", received)
                    .always("feesDue", billed.subtract(received));
        }
        return rec.map();
    }

    // Open cases heard on a date
    private List<Map<String, Object>> hearingsOn(List<Case> open, LocalDate date) {
        Map<Long, String> judges = judgeService.judgeNamesFor(open);
        return open.stream()
                .filter(c -> date.equals(c.getNextHearing()))
                .map(c -> caseRow(c, judges.get(c.getId())))
                .toList();
    }

    // Search by words and filters
    private Object searchCases(ToolInput in, ChatContext ctx) {
        List<String> tokens = tokens(in.text("query"));
        String status = in.text("status");
        String nature = in.text("nature");
        String court = lower(in.text("court"));
        String district = lower(in.text("district"));
        String courtNo = in.text("court_no");
        Long clientId = in.id("client_id");
        LocalDate from = in.date("hearing_from");
        LocalDate to = in.date("hearing_to");
        boolean openOnly = in.flag("open_only", false);
        int limit = in.number("limit", DEFAULT_LIMIT, 1, MAX_LIMIT);

        Comparator<Case> order = from != null || to != null
                ? Comparator.comparing(Case::getNextHearing)
                : Comparator.comparing(Case::getCreatedAt, Comparator.nullsLast(Comparator.<LocalDateTime>reverseOrder()));

        List<Case> matched = caseRepo.findByUser_Id(ctx.userId()).stream()
                .filter(c -> matchesAll(haystack(c), tokens))
                .filter(c -> status == null || status.equalsIgnoreCase(trim(c.getStatus())))
                .filter(c -> nature == null || nature.equalsIgnoreCase(c.getCaseNature()))
                .filter(c -> court == null || lower(c.getCourt()).contains(court))
                .filter(c -> district == null || lower(c.getDistrict()).contains(district))
                .filter(c -> courtNo == null || sameNo(courtNo, c.getCourtNo()))
                .filter(c -> clientId == null || involves(c, clientId))
                .filter(c -> from == null || (c.getNextHearing() != null && !c.getNextHearing().isBefore(from)))
                .filter(c -> to == null || (c.getNextHearing() != null && !c.getNextHearing().isAfter(to)))
                .filter(c -> !openOnly || !CaseStatuses.isClosed(c.getStatus()))
                .sorted(order)
                .toList();

        List<Case> page = matched.stream().limit(limit).toList();
        Map<Long, String> judges = judgeService.judgeNamesFor(page);

        return Rec.of()
                .always("totalMatches", matched.size())
                .always("returned", page.size())
                .always("cases", page.stream().map(c -> caseRow(c, judges.get(c.getId()))).toList())
                .map();
    }

    // Full detail of one case: parties, hearings, documents, fees
    private Object getCase(ToolInput in, ChatContext ctx) {
        Case c = resolveCase(in, ctx);
        String judge = judgeService.judgeNamesFor(List.of(c)).get(c.getId());

        List<ClientRefView> clients = clientsOf(c);

        Rec rec = Rec.of()
                .always("id", c.getId())
                .put("title", c.getTitle())
                .put("caseNo", c.getCaseNo())
                .put("fileNo", c.getFileNo())
                .put("cnrNo", c.getCnrNo())
                .put("status", c.getStatus())
                .put("caseNature", c.getCaseNature())
                .put("reliefSought", c.getReliefSought())
                .put("caseType", c.getCaseType())
                .put("filingDate", c.getFilingDate())
                .put("court", c.getCourt())
                .put("district", c.getDistrict())
                .put("courtNo", c.getCourtNo())
                .put("judge", judge)
                .put("nextHearing", c.getNextHearing())
                .put("causeListNo", c.getListingDate() != null && c.getListingDate().equals(c.getNextHearing())
                        ? c.getCauseListNo() : null)
                .put("clientSide", sideLabel(c.getClientSide()))
                .put("description", c.getDescription())
                .put("clients", clients.stream().map(v -> Rec.of()
                        .always("id", v.id()).put("name", v.name()).put("email", v.email())
                        .put("role", v.role()).put("primary", v.primary() ? true : null).map()).toList())
                .put("opposingParty", Rec.of()
                        .put("name", c.getOpposingParty())
                        .put("fatherName", c.getOpposingFatherName())
                        .put("address", c.getOpposingAddress())
                        .put("phone", c.getOpposingPhone()).map())
                .put("policeChallan", Rec.of()
                        .put("firNo", c.getFirNo())
                        .put("section", c.getFirSection())
                        .put("policeStation", c.getPoliceStation()).map())
                .put("chequeBounce", Rec.of()
                        .put("chequeNo", c.getChequeNo())
                        .put("chequeDate", c.getChequeDate())
                        .put("memoDate", c.getMemoDate())
                        .put("bouncingReason", c.getBouncingReason())
                        .put("claimAmount", c.getClaimAmount())
                        .put("noticeDate", c.getNoticeDate()).map())
                .always("whatsappReminders", c.isWhatsappRemindersEnabled()
                        ? "on, " + c.getReminderDaysBeforeOrDefault() + " day(s) before" : "off")
                .put("createdAt", c.getCreatedAt());

        if (!ctx.feesHidden()) {
            rec.put("fees", FeeSummary.of(c).toMap(true));
        }

        List<HearingDto> history = hearingService.listForCase(c.getId(), ctx.userId());
        rec.put("hearingHistory", history.stream().map(h -> Rec.of()
                .always("date", h.getDate())
                .put("time", h.getTime())
                .put("outcome", h.getOutcome())
                .put("notes", h.getNotes())
                .put("judge", h.getJudgeName())
                .put("orderDocument", h.getOrderDocName()).map()).toList());

        rec.put("documents", documentService.listForOwnedCase(c.getId()).stream().map(this::docRow).toList());

        return rec.map();
    }

    // Clients, optionally by type or name
    private Object listClients(ToolInput in, ChatContext ctx) {
        List<String> tokens = tokens(in.text("query"));
        String type = in.text("type");
        String label = in.text("label");
        int limit = in.number("limit", DEFAULT_LIMIT, 1, MAX_LIMIT);

        List<Case> cases = caseRepo.findByUser_Id(ctx.userId());

        List<Client> matched = clientRepo.findByUser_Id(ctx.userId()).stream()
                .filter(c -> matchesAll(String.join(" ", lower(c.getName()), lower(c.getEmail()),
                        lower(c.getWhatsapp_phone()), lower(c.getAdditional_phone()), lower(c.getAddress())), tokens))
                .filter(c -> type == null || isType(c, type))
                .filter(c -> label == null || (c.getCustomLabel() != null && c.getCustomLabel().getValue().equalsIgnoreCase(label)))
                .sorted(Comparator.comparing(c -> lower(c.getName())))
                .toList();

        return Rec.of()
                .always("totalMatches", matched.size())
                .always("clients", matched.stream().limit(limit).map(c -> clientRow(c, cases)).toList())
                .map();
    }

    // Matches a client type or label
    private boolean isType(Client c, String type) {
        if (c.getType() == null) return false;
        return c.getType().getValue().equalsIgnoreCase(type) || c.getType().name().equalsIgnoreCase(type);
    }

    // One client with their cases
    private Object getClient(ToolInput in, ChatContext ctx) {
        Client client = resolveClient(in, ctx);
        List<Case> cases = caseRepo.findByUser_Id(ctx.userId()).stream()
                .filter(c -> involves(c, client.getId()))
                .sorted(Comparator.comparing(Case::getCreatedAt, Comparator.nullsLast(Comparator.<LocalDateTime>reverseOrder())))
                .toList();
        Map<Long, String> judges = judgeService.judgeNamesFor(cases);

        Rec rec = Rec.from(clientRow(client, cases))
                .put("address", client.getAddress())
                .put("cases", cases.stream().map(c -> caseRow(c, judges.get(c.getId()))).toList())
                .put("documents", documentService.listForOwnedClient(client.getId()).stream().map(this::docRow).toList());

        if (!ctx.feesHidden()) {
            BigDecimal billed = BigDecimal.ZERO;
            BigDecimal received = BigDecimal.ZERO;
            for (Case c : cases) {
                FeeSummary f = FeeSummary.of(c);
                billed = billed.add(f.total());
                received = received.add(f.paid());
            }
            rec.always("feesBilled", billed).always("feesReceived", received).always("feesDue", billed.subtract(received));
        }
        return rec.map();
    }

    // Hearing history of a case or a date range
    private Object getHearings(ToolInput in, ChatContext ctx) {
        LocalDate from = Optional.ofNullable(in.date("from")).orElseGet(ChatTools::today);
        LocalDate to = Optional.ofNullable(in.date("to")).orElse(from.plusDays(30));
        Long caseId = in.id("case_id");

        List<Case> cases = caseRepo.findByUser_Id(ctx.userId()).stream()
                .filter(c -> caseId == null || c.getId().equals(caseId))
                .toList();
        Map<Long, String> judges = judgeService.judgeNamesFor(cases);

        List<Map<String, Object>> scheduled = cases.stream()
                .filter(c -> !CaseStatuses.isClosed(c.getStatus()))
                .filter(c -> c.getNextHearing() != null
                        && !c.getNextHearing().isBefore(from) && !c.getNextHearing().isAfter(to))
                .sorted(Comparator.comparing(Case::getNextHearing))
                .map(c -> caseRow(c, judges.get(c.getId())))
                .toList();

        Set<String> scheduledKeys = scheduled.stream()
                .map(m -> m.get("id") + "|" + m.get("nextHearing"))
                .collect(Collectors.toSet());

        List<Map<String, Object>> recorded = hearingRepo.findByFilters(ctx.userId(), caseId, from, to,
                        PageRequest.of(0, 300, Sort.by("date").ascending()))
                .getContent().stream()
                .filter(h -> !scheduledKeys.contains(h.getLegalCase().getId() + "|" + h.getDate()))
                .map(h -> Rec.of()
                        .always("caseId", h.getLegalCase().getId())
                        .put("caseTitle", h.getLegalCase().getTitle())
                        .put("caseNo", h.getLegalCase().getCaseNo())
                        .always("date", h.getDate())
                        .put("outcome", h.getOutcome())
                        .put("notes", h.getNotes())
                        .put("judge", h.getJudgeName())
                        .put("orderDocument", h.getOrderDocName()).map())
                .toList();

        return Rec.of()
                .always("from", from).always("to", to)
                .always("scheduledHearings", scheduled)
                .always("recordedHearings", recorded)
                .map();
    }

    // Everything on one day: hearings, judges on leave, holidays
    private Object hearingDay(ToolInput in, ChatContext ctx) {
        LocalDate date = in.date("date");
        if (date == null) throw new IllegalArgumentException("date is required");

        Map<Long, Case> byId = caseRepo.findByUser_Id(ctx.userId()).stream()
                .collect(Collectors.toMap(Case::getId, Function.identity()));

        List<Map<String, Object>> rows = hearingLeaveService.onLeaveFor(ctx.userId(), date).stream()
                .map(d -> {
                    Case c = byId.get(d.getCaseId());
                    return Rec.of()
                            .always("caseId", d.getCaseId())
                            .put("caseTitle", d.getCaseTitle())
                            .put("caseNo", c == null ? null : c.getCaseNo())
                            .put("court", d.getCourt())
                            .put("courtNo", d.getCourtNo())
                            .put("judge", d.getJudgeName())
                            .always("judgeOnLeave", d.isOnLeave())
                            .put("leaveFrom", d.getLeaveFrom())
                            .put("leaveTo", d.getLeaveTo())
                            .put("leaveReason", d.getReason())
                            .put("causeListNo", d.getCauseListNo()).map();
                }).toList();

        List<Map<String, Object>> listed = byId.values().stream()
                .filter(c -> date.equals(c.getNextHearing()) && !CaseStatuses.isClosed(c.getStatus()))
                .map(c -> caseRow(c, null))
                .toList();

        // The advocate's own courts come first
        rows = myCourtsFirst(rows, ctx);
        listed = myCourtsFirst(listed, ctx);

        return Rec.of()
                .always("date", date)
                .always("sundayOrBlocked", blocked(date, ctx))
                .always("judgeAndLeaveDetails", rows)
                .always("casesListedOnDate", listed)
                .map();
    }

    // Rows of the advocate's own courts first (in the order of the courts), other rows after them, order otherwise kept
    private static List<Map<String, Object>> myCourtsFirst(List<Map<String, Object>> rows, ChatContext ctx) {
        if (ctx.courts().isEmpty()) return rows;
        List<Map<String, Object>> sorted = new ArrayList<>(rows);
        sorted.sort(Comparator.comparingInt(r -> {
            int i = ctx.courts().indexOf(String.valueOf(r.get("court")));
            return i < 0 ? Integer.MAX_VALUE : i;
        }));
        return sorted;
    }

    // Billed, received and due amounts
    private Object feeOverview(ToolInput in, ChatContext ctx) {
        if (ctx.feesHidden()) throw new IllegalArgumentException("Fee details are not available on this account");

        Long clientId = in.id("client_id");
        Long caseId = in.id("case_id");
        boolean onlyDue = in.flag("only_due", true);
        int limit = in.number("limit", DEFAULT_LIMIT, 1, MAX_LIMIT);

        List<Case> cases = caseRepo.findByUser_Id(ctx.userId()).stream()
                .filter(c -> clientId == null || involves(c, clientId))
                .filter(c -> caseId == null || c.getId().equals(caseId))
                .toList();

        BigDecimal billed = BigDecimal.ZERO;
        BigDecimal received = BigDecimal.ZERO;
        List<Map<String, Object>> rows = new ArrayList<>();

        List<Object[]> scored = new ArrayList<>();
        for (Case c : cases) {
            FeeSummary f = FeeSummary.of(c);
            billed = billed.add(f.total());
            received = received.add(f.paid());
            if (onlyDue && f.due().signum() <= 0) continue;

            Map<String, Object> row = Rec.of()
                    .always("caseId", c.getId())
                    .put("caseTitle", c.getTitle())
                    .put("caseNo", c.getCaseNo())
                    .put("status", c.getStatus())
                    .put("client", c.getClient() == null ? null : c.getClient().getName())
                    .map();
            row.putAll(f.toMap(false));
            scored.add(new Object[]{f.due(), row});
        }

        scored.sort((a, b) -> ((BigDecimal) b[0]).compareTo((BigDecimal) a[0]));
        for (Object[] s : scored) {
            if (rows.size() >= limit) break;
            @SuppressWarnings("unchecked") Map<String, Object> row = (Map<String, Object>) s[1];
            rows.add(row);
        }

        return Rec.of()
                .always("casesMatched", scored.size())
                .always("totalBilled", billed)
                .always("totalReceived", received)
                .always("totalDue", billed.subtract(received))
                .always("cases", rows)
                .map();
    }

    // To-do tasks by status
    private Object listTasks(ToolInput in, ChatContext ctx) {
        String status = in.text("status");
        boolean overdueOnly = in.flag("overdue_only", false);
        LocalDate today = today();

        List<Map<String, Object>> rows = taskRepo.findByUser_Id(ctx.userId()).stream()
                .filter(t -> status == null || TaskStatuses.normalize(t.getStatus()).equalsIgnoreCase(status))
                .filter(t -> !overdueOnly || isOverdue(t, today))
                .sorted(Comparator.comparing(Task::getDueDate, Comparator.nullsLast(Comparator.<LocalDate>naturalOrder())))
                .map(t -> Rec.of()
                        .always("id", t.getId())
                        .put("title", t.getTitle())
                        .put("description", t.getDescription())
                        .always("status", TaskStatuses.normalize(t.getStatus()))
                        .put("category", t.getCategory())
                        .put("dueDate", t.getDueDate())
                        .always("overdue", isOverdue(t, today))
                        .put("completedAt", t.getCompletedAt()).map())
                .toList();

        return Rec.of().always("count", rows.size()).always("tasks", rows).map();
    }

    // Office expenses
    private Object listExpenses(ToolInput in, ChatContext ctx) {
        boolean unpaidOnly = in.flag("unpaid_only", false);

        List<OfficeExpenseDto> all = expenseService.list(ctx.userId(), ctx.accountId(), ctx.associate()).stream()
                .filter(e -> !unpaidOnly || !e.isPaid())
                .toList();

        BigDecimal total = all.stream().map(e -> nz(e.getAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal unpaid = all.stream().filter(e -> !e.isPaid())
                .map(e -> nz(e.getAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);

        return Rec.of()
                .always("count", all.size())
                .always("totalAmount", total)
                .always("unpaidAmount", unpaid)
                .always("expenses", all.stream().limit(MAX_LIMIT).map(e -> Rec.of()
                        .always("id", e.getId())
                        .put("description", e.getDescription())
                        .put("amount", e.getAmount())
                        .always("paid", e.isPaid())
                        .put("paidAt", e.getPaidAt())
                        .put("submittedBy", e.getSubmittedByName())
                        .put("upiId", e.getUpiId())
                        .put("createdAt", e.getCreatedAt()).map()).toList())
                .map();
    }

    // Documents by name, type, case or client
    private Object searchDocuments(ToolInput in, ChatContext ctx) {
        List<String> tokens = tokens(in.text("query"));
        String type = in.text("type");
        Long caseId = in.id("case_id");
        Long clientId = in.id("client_id");
        int limit = in.number("limit", DEFAULT_LIMIT, 1, MAX_LIMIT);

        Map<Long, Case> cases = caseRepo.findByUser_Id(ctx.userId()).stream()
                .collect(Collectors.toMap(Case::getId, Function.identity()));

        List<DocumentDto> matched = documentService.listForUser(ctx.userId()).stream()
                .filter(d -> matchesAll(lower(d.getName()) + " " + lower(d.getFileName()), tokens))
                .filter(d -> type == null || type.equalsIgnoreCase(trim(d.getType())))
                .filter(d -> caseId == null || caseId.equals(d.getCaseId()))
                .filter(d -> clientId == null || clientId.equals(d.getClientId()))
                .toList();

        return Rec.of()
                .always("totalMatches", matched.size())
                .always("documents", matched.stream().limit(limit).map(d -> {
                    Map<String, Object> row = docRow(d);
                    Case c = d.getCaseId() == null ? null : cases.get(d.getCaseId());
                    if (c != null) {
                        row.put("caseTitle", c.getTitle());
                        row.put("caseNo", c.getCaseNo());
                    }
                    return row;
                }).toList())
                .map();
    }

    // Judges List search
    private Object findJudges(ToolInput in) {
        String query = in.text("query");
        String court = in.text("court");
        String district = in.text("district");
        String courtNo = in.text("court_no");
        int limit = in.number("limit", DEFAULT_LIMIT, 1, MAX_LIMIT);

        List<Judge> judges = query == null
                ? judgeService.list(court, district)
                : judgeService.search(query, court, district, MAX_LIMIT);

        List<Judge> matched = judges.stream()
                .filter(j -> courtNo == null || sameNo(courtNo, j.getCourtRoomNo()))
                .toList();

        return Rec.of()
                .always("totalMatches", matched.size())
                .always("judges", matched.stream().limit(limit).map(j -> Rec.of()
                        .always("id", j.getId())
                        .put("name", j.getName())
                        .put("designation", j.getDesignation())
                        .put("court", j.getCourt())
                        .put("district", j.getDistrict())
                        .put("courtRoomNo", j.getCourtRoomNo())
                        .put("building", j.getBuilding())
                        .put("vcMeetingId", j.getVcMeetingId())
                        .put("courtEmail", j.getCourtEmail())
                        .put("virtualCourtLink", j.getVirtualCourtLink())
                        .put("courtReaderName", j.getCourtReaderName())
                        .put("courtReaderMobile", j.getCourtReaderMobile())
                        .put("jurisdiction", j.getJurisdiction()).map()).toList())
                .map();
    }

    // Judges on leave on a date
    private Object judgesOnLeave(ToolInput in) {
        JudgeOnLeaveResponse r = quickAccessService.getJudgesOnLeave(in.text("court"), in.text("district"));
        return Rec.of()
                .always("onLeaveToday", leaveRows(r.getOnLeaveToday()))
                .always("upcoming", leaveRows(r.getUpcoming()))
                .map();
    }

    // Leave entries as plain rows
    private List<Map<String, Object>> leaveRows(List<JudgeOnLeaveDto> rows) {
        if (rows == null) return List.of();
        return rows.stream().limit(MAX_LIMIT).map(j -> Rec.of()
                .put("judge", j.getName())
                .put("court", j.getCourt())
                .put("district", j.getDistrict())
                .put("from", j.getLeaveFrom())
                .put("to", j.getLeaveTo())
                .put("reason", j.getReason()).map()).toList();
    }

    // Court holidays in a range
    private Object holidays(ToolInput in, ChatContext ctx) {
        LocalDate from = Optional.ofNullable(in.date("from")).orElseGet(ChatTools::today);
        LocalDate to = Optional.ofNullable(in.date("to")).orElse(from.plusDays(90));

        List<Map<String, Object>> holidays = holidayRepo.findAllByOrderByDateAsc().stream()
                .filter(h -> !h.getDate().isBefore(from) && !h.getDate().isAfter(to))
                .map(HolidayDto::from)
                .map(h -> Rec.of()
                        .always("date", h.getDate())
                        .put("label", h.getLabel())
                        .put("description", h.getDescription())
                        .put("appliesTo", h.getCourtType()).map())
                .toList();

        List<LocalDate> blocked = hearingDayService.list(ctx.userId()).stream()
                .filter(d -> !d.isBefore(from) && !d.isAfter(to))
                .toList();

        return Rec.of()
                .always("from", from).always("to", to)
                .always("courtHolidays", holidays)
                .always("yourNoHearingDates", blocked)
                .map();
    }

    // Bail roster entries
    private Object bailRoster(ToolInput in) {
        List<String> tokens = tokens(in.text("query"));

        List<Map<String, Object>> rows = bailRosterService.list(in.text("court"), in.text("district")).stream()
                .filter(b -> matchesAll(lower(officers(b)) + " " + lower(b.getPoliceStationAgencies()), tokens))
                .limit(MAX_LIMIT)
                .map(b -> Rec.of()
                        .put("court", b.getCourt())
                        .put("district", b.getDistrict())
                        .put("judicialOfficers", officers(b))
                        .put("policeStationsAndAgencies", b.getPoliceStationAgencies())
                        .put("linkOneJudge", refRow(b.getLinkOneJudge()))
                        .put("linkTwoJudge", refRow(b.getLinkTwoJudge()))
                        .put("from", b.getFromDate())
                        .put("till", b.getTillDate())
                        .always("furtherOrder", b.isFurtherOrder()).map())
                .toList();

        return Rec.of().always("count", rows.size()).always("entries", rows).map();
    }

    // Duty magistrate roster entries
    private Object dutyMagistrate(ToolInput in) {
        List<String> tokens = tokens(in.text("query"));

        List<Map<String, Object>> rows = dutyMagistrateService.list(in.text("court"), in.text("district")).stream()
                .map(DutyMagistrateDto::from)
                .filter(d -> matchesAll(lower(d.getJudgeName()), tokens))
                .limit(MAX_LIMIT)
                .map(d -> Rec.of()
                        .put("court", d.getCourt())
                        .put("district", d.getDistrict())
                        .put("courtRoomNo", d.getCourtRoomNo())
                        .put("judge", d.getJudgeName())
                        .put("designation", d.getDesignation())
                        .put("workingDays", d.getWorkingDay())
                        .put("holidays", d.getHoliday())
                        .put("from", d.getFromDate())
                        .put("till", d.getTillDate())
                        .always("furtherOrder", d.isFurtherOrder()).map())
                .toList();

        return Rec.of().always("count", rows.size()).always("entries", rows).map();
    }

    // Latest notifications and circulations
    private Object notifications(ToolInput in) {
        String source = lower(in.text("source"));
        List<String> tokens = tokens(in.text("query"));
        int limit = in.number("limit", 10, 1, 50);

        List<NotificationDto> matched = notificationService.listAll().stream()
                .map(NotificationDto::from)
                .filter(n -> source == null || lower(n.getSource()).contains(source))
                .filter(n -> matchesAll(lower(n.getTitle()) + " " + lower(n.getMessage()), tokens))
                .sorted(Comparator.comparing(NotificationDto::getDate, Comparator.nullsLast(Comparator.<LocalDate>reverseOrder())))
                .toList();

        return Rec.of()
                .always("totalMatches", matched.size())
                .always("notifications", matched.stream().limit(limit).map(n -> Rec.of()
                        .put("source", n.getSource())
                        .put("title", n.getTitle())
                        .put("message", n.getMessage())
                        .put("date", n.getDate())
                        .always("important", n.isImportant())
                        .always("hasPdf", n.isHasPdf()).map()).toList())
                .map();
    }

    // Police stations, sub-divisions and districts
    private Object policeDirectory(ToolInput in) {
        List<String> tokens = tokens(in.text("query"));
        int limit = in.number("limit", 10, 1, 40);
        PoliceDirectoryDto directory = policeDirectoryService.directory();

        List<Map<String, Object>> rows = new ArrayList<>();
        if (directory.getDistricts() != null) {
            for (PoliceDirectoryDto.District d : directory.getDistricts()) {
                if (d.getSubDivisions() == null) continue;
                for (PoliceDirectoryDto.SubDivision sd : d.getSubDivisions()) {
                    if (sd.getStations() == null) continue;
                    for (PoliceDirectoryDto.Station s : sd.getStations()) {
                        String text = String.join(" ", lower(s.getName()), lower(s.getAddress()), lower(s.getPin()),
                                lower(sd.getAcp()), lower(d.getName()));
                        if (!matchesAll(text, tokens)) continue;
                        rows.add(Rec.of()
                                .put("station", s.getName())
                                .put("phone", s.getPhone())
                                .put("email", s.getEmail())
                                .put("address", s.getAddress())
                                .put("pin", s.getPin())
                                .put("acp", sd.getAcp())
                                .put("acpPhone", sd.getPhone())
                                .put("district", d.getName())
                                .put("districtRange", d.getRange())
                                .put("courtComplex", d.getCourt())
                                .put("dcpPhone", d.getDcp() == null ? null : d.getDcp().getPhone())
                                .put("dcpEmail", d.getDcp() == null ? null : d.getDcp().getEmail()).map());
                    }
                }
            }
        }

        return Rec.of()
                .always("totalMatches", rows.size())
                .always("stations", rows.stream().limit(limit).toList())
                .map();
    }

    // Which DRT or consumer commission covers a police station or amount
    private Object jurisdiction(ToolInput in) {
        String kind = in.text("kind");
        List<String> tokens = tokens(in.text("query"));
        if (kind == null) throw new IllegalArgumentException("kind must be DRT or CONSUMER");

        if ("DRT".equalsIgnoreCase(kind)) {
            List<Map<String, Object>> rows = drtService.directory().getTribunals().stream()
                    .filter(t -> matchesAll(String.join(" ", lower(t.getName()), lower(t.getLocation()),
                            lower(t.getDistrictsLabel()), lower(t.getJurisdictionText()),
                            lower(String.join(" ", orEmpty(t.getStations())))), tokens))
                    .map(t -> Rec.of()
                            .put("name", t.getName())
                            .put("kind", t.getKind())
                            .put("location", t.getLocation())
                            .put("phone", t.getPhone())
                            .put("districts", t.getDistrictsLabel())
                            .put("debtAmount", t.getAmountLabel())
                            .put("jurisdiction", t.getJurisdictionText())
                            .put("note", t.getNote())
                            .put("policeStations", t.getStations()).map())
                    .toList();
            return Rec.of().always("count", rows.size()).always("tribunals", rows).map();
        }

        List<Map<String, Object>> rows = consumerService.directory().getCommissions().stream()
                .filter(c -> matchesAll(String.join(" ", lower(c.getName()), lower(c.getLocation()),
                        lower(String.join(" ", orEmpty(c.getStations())))), tokens))
                .map(c -> Rec.of()
                        .put("name", c.getName())
                        .put("kind", c.getKind())
                        .put("location", c.getLocation())
                        .put("policeStations", c.getStations()).map())
                .toList();
        return Rec.of().always("count", rows.size()).always("commissions", rows).map();
    }

    // Subscription plan of the advocate. Associates only see what their advocate's plan includes, never prices
    private Object myPlan(ChatContext ctx) {
        User advocate = userRepo.findById(ctx.userId()).orElseThrow(() -> new NoSuchElementException("Account not found"));
        MyPlanDto mine = planService.myPlan(advocate);
        PlanDto current = mine.getCurrent();

        Rec rec = Rec.of()
                .always("plan", current.name)
                .put("tagline", current.tagline)
                .put("featuresIncluded", featureLabels(current))
                .put("planHighlights", current.features);

        if (ctx.associate()) {
            return rec.put("note", "Plan prices and billing are managed by the advocate, not available to associates.").map();
        }

        rec.put("monthlyPrice", planMoney(current.priceMonthly))
                .put("monthlyOfferPrice", planMoney(current.discountPrice))
                .put("yearlyPrice", planMoney(current.priceYearly))
                .put("yearlyOfferPrice", planMoney(current.discountPriceYearly))
                .always("associateSeatsAllowed", current.associateLimit == null ? 0
                        : current.associateLimit < 0 ? "unlimited" : current.associateLimit)
                .always("associateSeatsUsed", mine.getAssociatesUsed());

        List<Map<String, Object>> others = (mine.getAvailable() == null ? List.<PlanDto>of() : mine.getAvailable()).stream()
                .filter(p -> !Objects.equals(p.code, current.code))
                .map(p -> Rec.of()
                        .always("plan", p.name)
                        .put("tagline", p.tagline)
                        .put("monthlyPrice", planMoney(p.priceMonthly))
                        .put("monthlyOfferPrice", planMoney(p.discountPrice))
                        .put("yearlyPrice", planMoney(p.priceYearly))
                        .put("yearlyOfferPrice", planMoney(p.discountPriceYearly))
                        .put("associateSeats", p.associateLimit == null ? null : p.associateLimit < 0 ? "unlimited" : p.associateLimit)
                        .put("comingSoon", p.comingSoon ? Boolean.TRUE : null)
                        .put("featuresIncluded", featureLabels(p)).map())
                .toList();
        return rec.put("otherPlans", others)
                .put("note", "To change plan, use the Plans page of the app. You cannot change it.")
                .map();
    }

    // Readable names of the features a plan unlocks, a plan without a feature list gets every feature
    private static List<String> featureLabels(PlanDto plan) {
        if (plan.featureKeys == null) return new ArrayList<>(PlanService.CATALOG.values());
        return plan.featureKeys.stream().map(k -> PlanService.CATALOG.getOrDefault(k, k)).toList();
    }

    // Whole rupees of a plan price in the same Indian format as the other tools, null when there is no price
    private static String planMoney(Integer rupees) {
        return rupees == null ? null : Rec.rupees(BigDecimal.valueOf(rupees));
    }

    // Legal forms library, only when the advocate's plan includes it
    private Object legalForms(ToolInput in, ChatContext ctx) {
        User owner = userRepo.findById(ctx.userId()).orElseThrow(() -> new NoSuchElementException("Account not found"));
        User account = userRepo.findById(ctx.accountId()).orElse(owner);
        if (!account.isAdmin() && !planService.hasFeature(owner, "legal_forms")) {
            return Rec.of().always("available", false)
                    .always("note", "Legal Forms are not part of this plan.").map();
        }

        String query = lower(in.text("query"));
        int limit = in.number("limit", DEFAULT_LIMIT, 1, 50);

        List<LegalFormDto> matched = legalFormRepo.findAll().stream()
                .sorted(Comparator.comparing((LegalForm f) -> f.getSortOrder() == null ? 0 : f.getSortOrder())
                        .thenComparing(f -> lower(f.getName())))
                .map(LegalFormDto::from)
                .filter(f -> query.isEmpty() || lower(f.getName()).contains(query) || lower(f.getDescription()).contains(query))
                .toList();

        List<Map<String, Object>> rows = matched.stream().limit(limit).map(f -> Rec.of()
                .always("id", f.getId())
                .always("name", f.getName())
                .put("description", f.getDescription())
                .always("fillableFromCase", f.isFillable())
                .put("fieldsFilled", f.getFieldCount() > 0 ? f.getFieldCount() : null).map()).toList();

        return Rec.of()
                .always("count", matched.size())
                .always("forms", rows)
                .put("partial", matched.size() > rows.size() ? Boolean.TRUE : null)
                .always("howToFill", "Open Legal Forms from the sidebar, pick the form and choose a case. Fillable forms are filled from the case details automatically.")
                .map();
    }

    // Next file number and released numbers
    private Object fileNumbers(ChatContext ctx) {
        FileNumberSummaryDto s = fileNumberService.summary(ctx.userId());
        return Rec.of()
                .always("nextAutomaticFileNumber", s.getNextNumber())
                .always("highestNumberInUse", s.getMaxOccupied())
                .always("numbersInUse", s.getOccupiedCount())
                .always("releasedNumbers", s.getReleased() == null ? List.of() : s.getReleased().stream().map(r -> Rec.of()
                        .always("number", r.getNumber())
                        .put("lastHeldByCase", r.getCaseTitle())
                        .put("caseNo", r.getCaseNo()).map()).toList())
                .map();
    }

    // Case by id or by case no / file no / CNR, only the user's own
    private Case resolveCase(ToolInput in, ChatContext ctx) {
        Long id = in.id("case_id");
        String reference = in.text("reference");

        if (id != null) {
            Case c = caseRepo.findById(id).orElseThrow(() -> new NoSuchElementException("Case not found"));
            if (c.getUser() == null || !c.getUser().getId().equals(ctx.userId())) {
                throw new NoSuchElementException("Case not found");
            }
            return c;
        }

        if (reference == null) throw new IllegalArgumentException("case_id or reference is required");

        List<Case> hits = caseRepo.findByUser_Id(ctx.userId()).stream()
                .filter(c -> reference.equalsIgnoreCase(trim(c.getCaseNo()))
                        || reference.equalsIgnoreCase(trim(c.getFileNo()))
                        || reference.equalsIgnoreCase(trim(c.getCnrNo())))
                .toList();

        if (hits.isEmpty()) throw new NoSuchElementException("Case not found");
        return hits.get(0);
    }

    // Client by id or name, only the user's own
    private Client resolveClient(ToolInput in, ChatContext ctx) {
        Long id = in.id("client_id");
        String name = in.text("name");

        List<Client> mine = clientRepo.findByUser_Id(ctx.userId());

        if (id != null) {
            return mine.stream().filter(c -> c.getId().equals(id)).findFirst()
                    .orElseThrow(() -> new NoSuchElementException("Client not found"));
        }
        if (name == null) throw new IllegalArgumentException("client_id or name is required");

        List<Client> hits = mine.stream().filter(c -> lower(c.getName()).contains(lower(name))).toList();
        if (hits.isEmpty()) throw new NoSuchElementException("Client not found");
        if (hits.size() > 1) {
            Optional<Client> exact = hits.stream().filter(c -> name.equalsIgnoreCase(trim(c.getName()))).findFirst();
            if (exact.isPresent()) return exact.get();
            throw new IllegalArgumentException("Several clients match: " + hits.stream()
                    .limit(10).map(c -> c.getName() + " (id " + c.getId() + ")").collect(Collectors.joining(", ")));
        }
        return hits.get(0);
    }

    // Compact case summary row
    private Map<String, Object> caseRow(Case c, String judge) {
        return Rec.of()
                .always("id", c.getId())
                .put("title", c.getTitle())
                .put("caseNo", c.getCaseNo())
                .put("fileNo", c.getFileNo())
                .put("cnrNo", c.getCnrNo())
                .put("status", c.getStatus())
                .put("nature", c.getCaseNature())
                .put("reliefSought", c.getReliefSought())
                .put("caseType", c.getCaseType())
                .put("court", c.getCourt())
                .put("district", c.getDistrict())
                .put("courtNo", c.getCourtNo())
                .put("judge", judge)
                .put("nextHearing", c.getNextHearing())
                .put("clients", clientsOf(c).stream().map(ClientRefView::name).toList())
                .map();
    }

    // Compact client summary row
    private Map<String, Object> clientRow(Client c, List<Case> allCases) {
        List<Case> mine = allCases.stream().filter(x -> involves(x, c.getId())).toList();
        return Rec.of()
                .always("id", c.getId())
                .put("name", c.getName())
                .put("type", c.getType() == null ? null : c.getType().getValue())
                .put("label", c.getCustomLabel() == null ? null : c.getCustomLabel().getValue())
                .put("email", c.getEmail())
                .put("whatsappPhone", c.getWhatsapp_phone())
                .put("additionalPhone", c.getAdditional_phone())
                .always("totalCases", mine.size())
                .always("openCases", mine.stream().filter(x -> !CaseStatuses.isClosed(x.getStatus())).count())
                .put("clientSince", c.getCreatedAt())
                .map();
    }

    // Compact document row
    private Map<String, Object> docRow(DocumentDto d) {
        return Rec.of()
                .put("id", d.getId())
                .put("name", d.getName())
                .put("type", d.getType())
                .put("fileName", d.getFileName())
                .put("size", d.getSize())
                .put("uploaded", d.getDate())
                .put("caseId", d.getCaseId())
                .put("clientId", d.getClientId())
                .put("orderDate", d.getOrderDate())
                .map();
    }

    // A client on a case with their role
    private record ClientRefView(Long id, String name, String email, String role, boolean primary) {}

    // Primary and additional clients of a case
    private List<ClientRefView> clientsOf(Case c) {
        List<ClientRefView> out = new ArrayList<>();
        Map<Long, String> roles = c.getClientSubTypes() == null ? Map.of() : c.getClientSubTypes();

        if (c.getClient() != null) {
            out.add(new ClientRefView(c.getClient().getId(), c.getClient().getName(),
                    c.getClient().getEmail(), roles.get(c.getClient().getId()), true));
        }
        if (c.getAdditionalClients() != null) {
            for (Client x : c.getAdditionalClients()) {
                out.add(new ClientRefView(x.getId(), x.getName(), x.getEmail(), roles.get(x.getId()), false));
            }
        }
        return out;
    }

    // True when the client is on the case
    private boolean involves(Case c, Long clientId) {
        if (c.getClient() != null && clientId.equals(c.getClient().getId())) return true;
        return c.getAdditionalClients() != null
                && c.getAdditionalClients().stream().anyMatch(x -> clientId.equals(x.getId()));
    }

    // All searchable text of a case in one string
    private String haystack(Case c) {
        StringBuilder sb = new StringBuilder();
        for (String s : new String[]{c.getTitle(), c.getCaseNo(), c.getFileNo(), c.getCnrNo(), c.getOpposingParty(),
                c.getCourt(), c.getDistrict(), c.getCourtNo(), c.getReliefSought(), c.getCaseType(), c.getFirNo(),
                c.getPoliceStation(), c.getDescription(), c.getStatus(), c.getCaseNature()}) {
            if (s != null) sb.append(s.toLowerCase()).append(' ');
        }
        clientsOf(c).forEach(v -> sb.append(lower(v.name())).append(' '));
        return sb.toString();
    }

    // Judicial officers of a bail roster entry as text
    private String officers(BailRosterDto b) {
        if (b.getJudicialOfficers() != null && !b.getJudicialOfficers().isEmpty()) {
            return b.getJudicialOfficers().stream().map(JudgeRefDto::getName).collect(Collectors.joining(", "));
        }
        return b.getJudicialOfficersText();
    }

    // Judge reference as a row
    private Map<String, Object> refRow(JudgeRefDto j) {
        if (j == null) return null;
        return Rec.of()
                .put("name", j.getName())
                .put("designation", j.getDesignation())
                .put("courtRoomNo", j.getCourtRoomNo())
                .put("virtualCourtLink", j.getVirtualCourtLink()).map();
    }

    // True on Sundays and days the advocate blocked
    private boolean blocked(LocalDate date, ChatContext ctx) {
        return HearingDayService.isSunday(date) || hearingDayService.list(ctx.userId()).contains(date);
    }

    // Task is done
    private boolean isCompleted(Task t) {
        return TaskStatuses.COMPLETED.equalsIgnoreCase(TaskStatuses.normalize(t.getStatus()));
    }

    // Open task past its due date
    private boolean isOverdue(Task t, LocalDate today) {
        return !isCompleted(t) && t.getDueDate() != null && t.getDueDate().isBefore(today);
    }

    // Case numbers compared ignoring case and spaces
    private boolean sameNo(String a, String b) {
        return com.internyay.util.CourtMatch.sameCourtNo(a, b);
    }

    // Readable label for the client side
    private static String sideLabel(String side) {
        if (side == null) return null;
        return "COMPLAINANT".equalsIgnoreCase(side)
                ? "Clients are on the Complainant / Petitioner / Plaintiff side"
                : "Clients are on the Accused / Respondent / Defendant side";
    }

    // Search text split into lower case words
    private static List<String> tokens(String query) {
        if (query == null) return List.of();
        return Arrays.stream(query.toLowerCase().split("\\s+")).filter(s -> !s.isBlank()).toList();
    }

    // All words are present
    private static boolean matchesAll(String text, List<String> tokens) {
        return tokens.stream().allMatch(text::contains);
    }

    // Null safe lower case
    private static String lower(String s) {
        return s == null ? "" : s.toLowerCase();
    }

    // Null safe trim
    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    // Dash for empty values
    private static String orDash(String s) {
        return s == null || s.isBlank() ? "Unspecified" : s.trim();
    }

    // Null becomes zero
    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    // Null becomes an empty list
    private static <T> List<T> orEmpty(List<T> list) {
        return list == null ? List.of() : list;
    }
}