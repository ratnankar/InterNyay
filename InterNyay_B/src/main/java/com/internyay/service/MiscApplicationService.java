package com.internyay.service;

import com.internyay.dto.*;
import com.internyay.entity.Case;
import com.internyay.entity.DocumentMeta;
import com.internyay.entity.MiscApplication;
import com.internyay.entity.MiscApplicationHearing;
import com.internyay.repository.MiscApplicationHearingRepository;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.MiscApplicationRepository;
import com.internyay.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.NoSuchElementException;

// Misc. applications filed in cases: add (in a case the advocate has or in a case created with it), edit, dispose off,
// documents. Everything is scoped to the owning advocate; someone else's application answers "not found"
@Service
@RequiredArgsConstructor
public class MiscApplicationService {

    private final MiscApplicationRepository repo;
    private final CaseRepository caseRepo;
    private final UserRepository userRepo;
    private final CaseService caseService;
    private final DocumentService documentService;
    private final HearingDayService hearingDays;
    private final MiscApplicationHearingRepository hearingRepo;

    // Document type shown in the Documents page for the order and the additional documents of an application
    static final String ORDER_TYPE = "Misc. Application Order";
    static final String ADDITIONAL_TYPE = "Misc. Application - Additional";

    // Newest first, filtered by status, case and a search text
    @Transactional(readOnly = true)
    public Page<MiscApplicationDto> list(Long userId, String status, String outcome, Long caseId, String search, int page, int size) {

        Pageable p = PageRequest.of(page, size, Sort.by("createdAt").descending().and(Sort.by("id").descending()));
        Page<MiscApplication> rows = repo.findByFilters(userId, blank(status), outcomeOf(outcome), caseId, blank(search), p);

        return rows.map(withDetails(rows.getContent()));
    }

    // Applications that have a hearing on a date: the dashboard shows them as their own cards
    @Transactional(readOnly = true)
    public List<MiscApplicationDto> onDate(Long userId, String date) {
        LocalDate day = parseDate("Date", date);
        if (day == null) throw new IllegalArgumentException("Date is needed");

        List<MiscApplication> rows = repo.findOnDate(userId, day);
        return rows.stream().map(withDetails(rows)).toList();
    }

    // Number of misc. application hearing dates in each case (caseId -> count), added to the case's hearing history count
    @Transactional(readOnly = true)
    public Map<Long, Long> hearingCounts(Long userId) {
        Map<Long, Long> counts = new java.util.HashMap<>();
        for (Object[] row : hearingRepo.countByCase(userId)) counts.put((Long) row[0], ((Number) row[1]).longValue());
        return counts;
    }

    // The cases that have a misc. application hearing on each date (yyyy-MM-dd -> case ids), so the calendar counts them
    @Transactional(readOnly = true)
    public Map<String, List<Long>> hearingDates(Long userId) {
        Map<String, List<Long>> byDate = new java.util.TreeMap<>();
        for (Object[] row : hearingRepo.caseIdsByDate(userId)) {
            byDate.computeIfAbsent(String.valueOf(row[0]), k -> new java.util.ArrayList<>()).add((Long) row[1]);
        }
        return byDate;
    }

    // Turns applications into DTOs with their documents and hearing history, each loaded once for the whole list
    private java.util.function.Function<MiscApplication, MiscApplicationDto> withDetails(List<MiscApplication> rows) {
        List<Long> ids = rows.stream().map(MiscApplication::getId).toList();
        Map<Long, List<DocumentDto>> docs = documentService.mapByMiscApplicationIds(ids);
        Map<Long, List<MiscHearingDto>> hearings = hearingsOf(ids);
        return a -> MiscApplicationDto.from(a, docs.getOrDefault(a.getId(), List.of()), hearings.getOrDefault(a.getId(), List.of()));
    }

    private Map<Long, List<MiscHearingDto>> hearingsOf(List<Long> ids) {
        if (ids.isEmpty()) return Map.of();
        return hearingRepo.findByMiscApplicationIdInOrderByHearingDateDesc(ids).stream()
                .collect(Collectors.groupingBy(MiscApplicationHearing::getMiscApplicationId,
                        Collectors.mapping(h -> MiscHearingDto.builder().id(h.getId()).date(h.getHearingDate().toString()).note(h.getNote()).build(),
                                Collectors.toList())));
    }

    @Transactional(readOnly = true)
    public MiscApplicationDto get(Long id, Long userId) {
        return toDto(findOwned(id, userId));
    }

    // Adds an application. For a NEW case the case is created first (same rules as Add Case: client, case no., CNR and
    // court are needed), so nothing is saved when either part is refused
    @Transactional
    public MiscApplicationDto create(MiscApplicationRequest req, Long userId) {

        String type = clean(req.getApplicationType());
        if (type == null) throw new IllegalArgumentException("Choose or type the application");

        LocalDate filing = parseDate("Filing date", req.getFilingDate());
        if (filing == null) filing = LocalDate.now();
        LocalDate hearing = parseDate("Next hearing date", req.getHearingDate());

        Case legalCase = req.isNewCase() ? createCase(req, userId) : ownedCase(req.getCaseId(), userId);

        // Checked before anything is saved: a closed day or a full day stops the whole request
        if (hearing != null) hearingDays.assertAllowed(hearing, userId, legalCase.getId());

        MiscApplication saved = repo.save(MiscApplication.builder()
                .legalCase(legalCase)
                .user(userRepo.getReferenceById(userId))
                .applicationType(type)
                .filingDate(filing)
                .hearingDate(hearing)
                .status(MiscApplication.PENDING)
                .build());

        recordHearing(saved);
        return toDto(saved);
    }

    // Edits the type, filing date and next hearing date. The case itself is not changed here
    @Transactional
    public MiscApplicationDto update(Long id, MiscApplicationRequest req, Long userId) {

        MiscApplication a = findOwned(id, userId);

        String type = clean(req.getApplicationType());
        if (type == null) throw new IllegalArgumentException("Choose or type the application");
        if (!type.equals(a.getApplicationType())) {
            a.setApplicationType(type);
            documentService.retypeMiscDocuments(a.getId(), MiscApplicationDto.ROLE_APPLICATION, type);
        }

        if (req.getFilingDate() != null) {
            LocalDate filing = parseDate("Filing date", req.getFilingDate());
            if (filing != null) a.setFilingDate(filing);
        }

        // An empty next hearing date clears it; a changed one must be an open day
        LocalDate hearing = parseDate("Next hearing date", req.getHearingDate());
        LocalDate held = a.getHearingDate();
        boolean hearingChanged = hearing != null && !hearing.equals(a.getHearingDate());
        if (hearingChanged) hearingDays.assertAllowed(hearing, userId, a.getLegalCase().getId());
        a.setHearingDate(hearing);

        MiscApplication saved = repo.save(a);
        if (hearingChanged) recordHearing(saved);
        // The note belongs to the hearing just held: the date the application was listed for until now
        String note = clean(req.getNote());
        if (hearingChanged && note != null && held != null) {
            hearingRepo.findByMiscApplicationIdAndHearingDate(saved.getId(), held).ifPresent(h -> {
                h.setNote(note);
                hearingRepo.save(h);
            });
        }
        return toDto(saved);
    }

    // Changes the date and note of one entry of the application's hearing history. When it was the next hearing date, that moves too
    @Transactional
    public MiscApplicationDto updateHearing(Long id, Long hearingId, String date, String note, Long userId) {
        MiscApplication a = findOwned(id, userId);
        MiscApplicationHearing h = ownedHearing(a, hearingId);

        LocalDate day = parseDate("Hearing date", date);
        if (day == null) throw new IllegalArgumentException("A hearing entry needs a date");

        if (!day.equals(h.getHearingDate())) {
            if (hearingRepo.existsByMiscApplicationIdAndHearingDate(a.getId(), day)) {
                throw new IllegalArgumentException("This application already has a hearing on that date");
            }
            hearingDays.assertAllowed(day, userId, a.getLegalCase().getId());

            boolean wasNext = h.getHearingDate().equals(a.getHearingDate());
            h.setHearingDate(day);
            hearingRepo.save(h);
            if (wasNext) {
                a.setHearingDate(day);
                repo.save(a);
            }
        }
        // An empty note clears it
        String cleaned = clean(note);
        if (cleaned != null && cleaned.length() > 2000) throw new IllegalArgumentException("The note is too long");
        h.setNote(cleaned);
        hearingRepo.save(h);
        return toDto(a);
    }

    // Removes one entry of the hearing history. When it was the next hearing date, the application has no next date again
    @Transactional
    public MiscApplicationDto deleteHearing(Long id, Long hearingId, Long userId) {
        MiscApplication a = findOwned(id, userId);
        MiscApplicationHearing h = ownedHearing(a, hearingId);

        boolean wasNext = h.getHearingDate().equals(a.getHearingDate());
        hearingRepo.delete(h);
        if (wasNext) {
            a.setHearingDate(null);
            repo.save(a);
        }
        return toDto(a);
    }

    // The hearing entry, only when it belongs to the application
    private MiscApplicationHearing ownedHearing(MiscApplication a, Long hearingId) {
        MiscApplicationHearing h = hearingRepo.findById(hearingId)
                .orElseThrow(() -> new NoSuchElementException("Hearing not found"));
        if (!h.getMiscApplicationId().equals(a.getId())) throw new NoSuchElementException("Hearing not found");
        return h;
    }

    // Marks the application as disposed off, as allowed or disallowed, on a date (the date is optional).
    // The order can be uploaded at any time
    @Transactional
    public MiscApplicationDto dispose(Long id, String disposedOn, String outcome, Long userId) {

        MiscApplication a = findOwned(id, userId);

        String result = outcomeOf(outcome);
        if (result == null) throw new IllegalArgumentException("Choose whether the application was allowed or disallowed");

        LocalDate day = parseDate("Disposal date", disposedOn);
        a.setStatus(MiscApplication.DISPOSED_OFF);
        a.setDisposedOn(day);
        a.setDisposalOutcome(result);

        return toDto(repo.save(a));
    }

    // Back to pending (disposed off by mistake). The order and the other documents stay
    @Transactional
    public MiscApplicationDto reopen(Long id, Long userId) {

        MiscApplication a = findOwned(id, userId);
        a.setStatus(MiscApplication.PENDING);
        a.setDisposedOn(null);
        a.setDisposalOutcome(null);

        return toDto(repo.save(a));
    }

    // Deletes the application with all its documents. The case and its own hearing history stay
    @Transactional
    public void delete(Long id, Long userId) {
        MiscApplication a = findOwned(id, userId);
        documentService.deleteAllForMiscApplication(a.getId());
        repo.delete(a);
    }

    // Stores a file for the application: the application itself (replaces the earlier one), its order (at any time,
    // replaces the earlier one) or one more additional document
    @Transactional
    public MiscApplicationDto uploadDocument(Long id, MultipartFile file, String name, String role, Long userId)
            throws IOException {

        MiscApplication a = findOwned(id, userId);
        String r = role == null ? "" : role.trim().toUpperCase();

        String type;
        switch (r) {
            case MiscApplicationDto.ROLE_APPLICATION -> type = a.getApplicationType();
            case MiscApplicationDto.ROLE_ORDER -> type = ORDER_TYPE;
            case MiscApplicationDto.ROLE_ADDITIONAL -> type = ADDITIONAL_TYPE;
            default -> throw new IllegalArgumentException("Choose what the file is: application, order or additional document");
        }

        String label = (name == null || name.isBlank())
                ? defaultLabel(a, r, file)
                : name.trim();

        DocumentDto stored = documentService.storeForMiscApplication(
                file, label, type, a.getLegalCase().getId(), a.getId(), r, userId);

        // One application file and one order: the earlier one goes once the new one is safely stored
        if (!MiscApplicationDto.ROLE_ADDITIONAL.equals(r)) {
            for (DocumentDto old : documentService.listForOwnedMiscApplication(a.getId())) {
                if (r.equals(old.miscRole) && !old.id.equals(stored.id)) {
                    documentService.delete(old.id, userId);
                }
            }
        }

        return toDto(a);
    }

    // Removes one document of the application
    @Transactional
    public MiscApplicationDto removeDocument(Long id, String docId, Long userId) {

        MiscApplication a = findOwned(id, userId);
        DocumentMeta meta = documentService.getMeta(docId);

        if (!a.getId().equals(meta.getMiscApplicationId())) {
            throw new NoSuchElementException("Document not found");
        }

        documentService.delete(docId, userId);
        return toDto(a);
    }

    // A new case for the application: the same checks and numbering as Add Case, as a fresh case with no hearing date yet
    private Case createCase(MiscApplicationRequest req, Long userId) {

        if (req.getClientId() == null) throw new IllegalArgumentException("Choose the client");
        if (clean(req.getCaseTitle()) == null) throw new IllegalArgumentException("Enter the case title");
        if (clean(req.getCaseNo()) == null) throw new IllegalArgumentException("Enter the case number");
        if (clean(req.getCourt()) == null) throw new IllegalArgumentException("Choose the court");

        CaseRequest cr = new CaseRequest();
        cr.setTitle(clean(req.getCaseTitle()));
        cr.setCaseNo(clean(req.getCaseNo()));
        cr.setCnrNo(req.getCnrNo());
        cr.setCourt(clean(req.getCourt()));
        cr.setDistrict(req.getDistrict());
        cr.setClientId(req.getClientId());
        cr.setStatus("Pending");
        cr.setCaseAge("FRESH");

        CaseDto created = caseService.create(cr, userId);
        return ownedCase(created.getId(), userId);
    }

    // Adds the application's next hearing date to its own hearing history (a date already there is not added twice).
    // The case's hearing history is not touched: the application has its own
    private void recordHearing(MiscApplication a) {
        if (a.getHearingDate() == null) return;
        if (hearingRepo.existsByMiscApplicationIdAndHearingDate(a.getId(), a.getHearingDate())) return;

        hearingRepo.save(MiscApplicationHearing.builder()
                .miscApplicationId(a.getId())
                .hearingDate(a.getHearingDate())
                .build());
    }

    private MiscApplicationDto toDto(MiscApplication a) {
        // Reloaded with the case, court and client so the DTO never reads a lazy relation
        MiscApplication full = repo.findWithCaseById(a.getId()).orElse(a);
        return MiscApplicationDto.from(full, documentService.listForOwnedMiscApplication(full.getId()),
                hearingsOf(List.of(full.getId())).getOrDefault(full.getId(), List.of()));
    }

    // Name shown for a file when none is typed
    private static String defaultLabel(MiscApplication a, String role, MultipartFile file) {
        String original = file != null && file.getOriginalFilename() != null && !file.getOriginalFilename().isBlank()
                ? file.getOriginalFilename() : a.getApplicationType();
        return MiscApplicationDto.ROLE_ORDER.equals(role) ? "Order — " + a.getApplicationType() : original;
    }

    // The application, only for its owner (404 for anyone else, so ids cannot be probed)
    private MiscApplication findOwned(Long id, Long userId) {
        MiscApplication a = repo.findWithCaseById(id)
                .orElseThrow(() -> new NoSuchElementException("Application not found"));
        if (!a.getUser().getId().equals(userId)) throw new NoSuchElementException("Application not found");
        return a;
    }

    private Case ownedCase(Long caseId, Long userId) {
        if (caseId == null) throw new IllegalArgumentException("Choose the case");
        Case c = caseRepo.findById(caseId).orElseThrow(() -> new NoSuchElementException("Case not found"));
        if (c.getUser() == null || !c.getUser().getId().equals(userId)) throw new NoSuchElementException("Case not found");
        return c;
    }

    private static LocalDate parseDate(String label, String text) {
        if (text == null || text.isBlank()) return null;
        try {
            return LocalDate.parse(text.trim());
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(label + " is not a valid date");
        }
    }

    // "allowed" / "Disallowed" in any letter case, or null when it is neither
    private static String outcomeOf(String text) {
        String t = clean(text);
        if (t == null) return null;
        if (t.equalsIgnoreCase(MiscApplication.ALLOWED)) return MiscApplication.ALLOWED;
        if (t.equalsIgnoreCase(MiscApplication.DISALLOWED)) return MiscApplication.DISALLOWED;
        return null;
    }

    private static String clean(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private static String blank(String s) {
        return clean(s);
    }
}
