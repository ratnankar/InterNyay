package com.internyay.service;

import com.internyay.dto.*;
import com.internyay.entity.Case;
import com.internyay.entity.DocumentMeta;
import com.internyay.entity.MiscApplication;
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
    private final HearingService hearingService;
    private final HearingDayService hearingDays;

    // Document type shown in the Documents page for the order and the additional documents of an application
    static final String ORDER_TYPE = "Misc. Application Order";
    static final String ADDITIONAL_TYPE = "Misc. Application - Additional";

    // Newest first, filtered by status, case and a search text
    @Transactional(readOnly = true)
    public Page<MiscApplicationDto> list(Long userId, String status, Long caseId, String search, int page, int size) {

        Pageable p = PageRequest.of(page, size, Sort.by("createdAt").descending().and(Sort.by("id").descending()));
        Page<MiscApplication> rows = repo.findByFilters(userId, blank(status), caseId, blank(search), p);

        Map<Long, List<DocumentDto>> docs = documentService.mapByMiscApplicationIds(
                rows.getContent().stream().map(MiscApplication::getId).toList());

        return rows.map(a -> MiscApplicationDto.from(a, docs.getOrDefault(a.getId(), List.of())));
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
        LocalDate hearing = parseDate("Hearing date", req.getHearingDate());

        Case legalCase = req.isNewCase() ? createCase(req, userId) : ownedCase(req.getCaseId(), userId);

        // Checked before anything is saved: a closed day or a full day stops the whole request
        if (hearing != null) hearingDays.assertAllowed(hearing, userId, legalCase.getId());

        MiscApplication saved = repo.save(MiscApplication.builder()
                .legalCase(legalCase)
                .user(userRepo.getReferenceById(userId))
                .applicationType(type)
                .history(clean(req.getHistory()))
                .filingDate(filing)
                .hearingDate(hearing)
                .status(MiscApplication.PENDING)
                .build());

        recordHearing(saved, userId);
        return toDto(saved);
    }

    // Edits the type, history, filing date and hearing date. The case itself is not changed here
    @Transactional
    public MiscApplicationDto update(Long id, MiscApplicationRequest req, Long userId) {

        MiscApplication a = findOwned(id, userId);

        String type = clean(req.getApplicationType());
        if (type == null) throw new IllegalArgumentException("Choose or type the application");
        a.setApplicationType(type);
        a.setHistory(clean(req.getHistory()));

        if (req.getFilingDate() != null) {
            LocalDate filing = parseDate("Filing date", req.getFilingDate());
            if (filing != null) a.setFilingDate(filing);
        }

        // An empty hearing date clears it; a changed one must be an open day
        LocalDate hearing = parseDate("Hearing date", req.getHearingDate());
        boolean hearingChanged = hearing != null && !hearing.equals(a.getHearingDate());
        if (hearingChanged) hearingDays.assertAllowed(hearing, userId, a.getLegalCase().getId());
        a.setHearingDate(hearing);

        MiscApplication saved = repo.save(a);
        if (hearingChanged) recordHearing(saved, userId);
        return toDto(saved);
    }

    // Marks the application as disposed off on a date (today when none is given). The order can be uploaded at any time
    @Transactional
    public MiscApplicationDto dispose(Long id, String disposedOn, Long userId) {

        MiscApplication a = findOwned(id, userId);

        LocalDate day = parseDate("Disposal date", disposedOn);
        a.setStatus(MiscApplication.DISPOSED_OFF);
        a.setDisposedOn(day != null ? day : LocalDate.now());

        return toDto(repo.save(a));
    }

    // Back to pending (disposed off by mistake). The order and the other documents stay
    @Transactional
    public MiscApplicationDto reopen(Long id, Long userId) {

        MiscApplication a = findOwned(id, userId);
        a.setStatus(MiscApplication.PENDING);
        a.setDisposedOn(null);

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

    // Puts the application and its history into the hearing history of its case, on its hearing date
    private void recordHearing(MiscApplication a, Long userId) {
        if (a.getHearingDate() == null) return;

        String line = "Misc. application: " + a.getApplicationType();
        if (a.getHistory() != null) line += " — " + a.getHistory();

        hearingService.noteApplicationHearing(a.getLegalCase(), a.getHearingDate(), line, userId);
    }

    private MiscApplicationDto toDto(MiscApplication a) {
        // Reloaded with the case, court and client so the DTO never reads a lazy relation
        MiscApplication full = repo.findWithCaseById(a.getId()).orElse(a);
        return MiscApplicationDto.from(full, documentService.listForOwnedMiscApplication(full.getId()));
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

    private static String clean(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private static String blank(String s) {
        return clean(s);
    }
}
