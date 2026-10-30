package com.internyay.service;

import com.internyay.dto.*;
import com.internyay.entity.*;
import com.internyay.repository.*;
import com.internyay.util.CaseStatuses;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.util.List;

// Hearing history of cases
@Service
@RequiredArgsConstructor
@Slf4j
public class HearingService {

    private final HearingRepository hearingRepo;
    private final CaseRepository caseRepo;
    private final UserRepository userRepo;
    private final DocumentService documentService;
    private final HearingDayService hearingDays;
    private final OrdersPolicyService ordersPolicy;
    private final ScrapingService scrapingService;
    private final OldCaseImportService oldCaseImport;
    private final TransactionTemplate tx;

    // Hearings in a date range, oldest first. Read inside a transaction because each hearing's case is
    // loaded lazily and open-in-view is off, so the DTO could not read the case title outside one
    @Transactional(readOnly = true)
    public Page<HearingDto> list(Long userId, Long caseId, LocalDate from, LocalDate to, int page, int size) {
        Pageable p = PageRequest.of(page, size, Sort.by("date").ascending());
        // Open-ended range instead of null dates, so the query never has to compare against a null date parameter
        LocalDate start = from != null ? from : LocalDate.of(1900, 1, 1);
        LocalDate end   = to   != null ? to   : LocalDate.of(2999, 12, 31);
        return hearingRepo.findByFilters(userId, caseId, start, end, p).map(HearingDto::from);
    }

    // History of one case, newest first (transaction needed for the lazily loaded case, see list above)
    @Transactional(readOnly = true)
    public List<HearingDto> listForCase(Long caseId, Long userId) {
        Case c = ownedCase(caseId, userId);

        List<HearingDto> rows = hearingRepo.findByLegalCase_IdAndUser_IdOrderByDateDesc(caseId, userId)
                .stream().map(HearingDto::from).toList();

        // Mahila courts and family disputes do not declare orders, the screen then offers no eCourts fetch
        OrdersPolicyService.Verdict orders = ordersPolicy.forCase(c);
        if (!orders.declared()) {
            rows.forEach(r -> {
                r.setOrdersNotDeclared(true);
                r.setOrdersNotDeclaredReason(orders.reason());
            });
        }

        return rows;
    }

    // Edit a hearing, a changed date must not be a closed day
    @Transactional
    public HearingDto update(Long id, HearingRequest req, Long userId) {
        Hearing h = findOwned(id, userId);
        boolean dateChanged = false;

        if (req.getDate() != null && !req.getDate().equals(h.getDate())) {
            hearingDays.assertAllowed(req.getDate(), userId, h.getLegalCase().getId());

            hearingRepo.findByLegalCase_IdAndUser_IdAndDate(
                            h.getLegalCase().getId(), userId, req.getDate())
                    .filter(other -> !other.getId().equals(id))
                    .ifPresent(other -> {
                        throw new IllegalArgumentException(
                                "This case already has an entry for " + req.getDate()
                                        + " — edit that one instead");
                    });

            h.setDate(req.getDate());
            dateChanged = true;

            // What was learned about orders belonged to the old date (a Refresh learns it again for the new one)
            if (h.getOrderDocId() == null) {
                h.setEcourtsOrderFile(null);
                h.setNoOrderOnRecord(null);
            }
        }

        if (req.getTime()    != null) h.setTime(blankToNull(req.getTime()));
        if (req.getNotes()   != null) h.setNotes(blankToNull(req.getNotes()));
        if (req.getOutcome() != null) h.setOutcome(blankToNull(req.getOutcome()));

        Hearing saved = hearingRepo.saveAndFlush(h);
        // A moved date changes the order of the dates, so the order numbers follow it
        if (dateChanged) renumberOrders(saved.getLegalCase().getId(), userId);
        return HearingDto.from(saved);
    }

    // Delete a hearing along with its attached order. When it was the case's next hearing date, or no hearing
    // dates are left at all, the case's next hearing moves on to the earliest upcoming date still in the history,
    // or goes blank. The answer carries the case's next hearing so the screen can show it straight away
    @Transactional
    public NextHearingResponse delete(Long id, Long userId) {
        Hearing h = findOwned(id, userId);
        Case c = h.getLegalCase();
        Long caseId = c.getId();
        LocalDate deletedDate = h.getDate();

        detachOrder(h, userId);
        hearingRepo.delete(h);
        hearingRepo.flush();
        renumberOrders(caseId, userId);

        List<Hearing> remaining = hearingRepo.findByLegalCase_IdAndUser_IdOrderByDateDesc(caseId, userId);
        boolean wasNext = deletedDate != null && deletedDate.equals(c.getNextHearing());

        if (c.getNextHearing() != null && (remaining.isEmpty() || wasNext)) {
            LocalDate today = LocalDate.now();
            LocalDate upcoming = remaining.stream()
                    .map(Hearing::getDate)
                    .filter(d -> d != null && !d.isBefore(today))
                    .min(LocalDate::compareTo)
                    .orElse(null);

            c.setNextHearing(upcoming);
            // The cause list number and listing date belonged to the old date
            c.setCauseListNo(null);
            c.setListingDate(null);
            caseRepo.save(c);
        }

        return new NextHearingResponse(caseId, c.getNextHearing(), null);
    }

    // Closes the current hearing (notes/outcome become a history entry) and moves the case to the new date
    @Transactional
    public NextHearingResponse moveNextHearing(Long caseId, NextHearingRequest req, Long userId) {

        Case c = ownedCase(caseId, userId);

        if (req.getNextHearing() != null && !req.getNextHearing().equals(c.getNextHearing())) {
            hearingDays.assertAllowed(req.getNextHearing(), userId, caseId);
        }

        // The hearing being closed is the one just heard, unless a closing date is given
        LocalDate closing = req.getClosingDate() != null ? req.getClosingDate() : c.getNextHearing();

        HearingDto recorded = null;

        // The hearing date being closed is always stored in the history, even with no outcome or note,
        // when notes were entered or the case is being moved to a new date
        boolean hasSomethingToRecord =
                blankToNull(req.getNotes()) != null || blankToNull(req.getOutcome()) != null;
        boolean dateIsMoving =
                req.getNextHearing() != null && !req.getNextHearing().equals(c.getNextHearing());

        if (closing != null && (hasSomethingToRecord || dateIsMoving)) {
            recorded = HearingDto.from(
                    upsert(caseId, closing, req.getNotes(), req.getOutcome(), null, userId));
            hearingRepo.flush();
            renumberOrders(caseId, userId);
        }

        if (req.getNextHearing() != null && !req.getNextHearing().equals(c.getNextHearing())) {
            // A new date invalidates the old cause list number and listing date, the hearing keeps the old one
            keepCauseListNo(c, userId);
            c.setCauseListNo(null);
            c.setListingDate(null);
            c.setNextHearing(req.getNextHearing());
            caseRepo.save(c);
            recordHeard(c, req.getNextHearing(), userId);
        }

        return new NextHearingResponse(c.getId(), c.getNextHearing(), recorded);
    }

    // The automatic next hearing date update (NextHearingUpdateService): eCourts shows a new date for a case that
    // still has the hearing date just heard as its next hearing. Does what moveNextHearing does (the heard date goes
    // into the history, the cause list number of the old date is kept on it, the new date becomes the next hearing),
    // except that the daily limit and no-hearing days are not checked: the date is the court's and cannot be refused.
    // Returns false and changes nothing when the case moved on meanwhile (the advocate set a date, closed the case)
    @Transactional
    public boolean applyEcourtsNextHearing(Long caseId, LocalDate heardDate, LocalDate newDate) {
        if (heardDate == null || newDate == null || !newDate.isAfter(heardDate)) return false;

        Case c = caseRepo.findById(caseId).orElse(null);
        if (c == null || CaseStatuses.isClosed(c.getStatus()) || !heardDate.equals(c.getNextHearing())) return false;

        Long userId = c.getUser().getId();

        Hearing heard = upsert(caseId, heardDate, null, null, null, userId);
        hearingRepo.flush();
        renumberOrders(caseId, userId);

        keepCauseListNo(c, userId);
        c.setCauseListNo(null);
        c.setListingDate(null);
        c.setNextHearing(newDate);
        caseRepo.save(c);
        recordHeard(c, newDate, userId);
        return true;
    }

    // The date a case was moved away from (e.g. from the Edit Case form) is kept in the hearing history,
    // so changing the next hearing date again and again never loses the earlier dates. Nothing happens when
    // the date already has an entry
    @Transactional
    public void recordHeard(Case legalCase, LocalDate date, Long userId) {
        if (date == null) return;
        if (hearingRepo.findByLegalCase_IdAndUser_IdAndDate(legalCase.getId(), userId, date).isPresent()) return;

        hearingRepo.saveAndFlush(Hearing.builder()
                .date(date)
                .legalCase(legalCase)
                .user(userRepo.getReferenceById(userId))
                .build());
        renumberOrders(legalCase.getId(), userId);
    }

    // The cause list number on a case row belongs to the date it was listed for and is cleared when the case moves on.
    // Call this before clearing it: the number goes to the hearing of that date (created when missing), so it is kept
    @Transactional
    public void keepCauseListNo(Case legalCase, Long userId) {
        Integer no = legalCase.getCauseListNo();
        LocalDate listed = legalCase.getListingDate();
        if (no == null || listed == null) return;

        recordHeard(legalCase, listed, userId);
        hearingRepo.findByLegalCase_IdAndUser_IdAndDate(legalCase.getId(), userId, listed).ifPresent(h -> {
            if (h.getCauseListNo() == null) {
                h.setCauseListNo(no);
                hearingRepo.save(h);
            }
        });
    }

    // A case taken out of Withdrawn loses the Withdrawn mark on its hearing history, the dates stay
    @Transactional
    public void clearWithdrawn(Long caseId, Long userId) {
        for (Hearing h : hearingRepo.findByLegalCase_IdAndUser_IdOrderByDateDesc(caseId, userId)) {
            if (com.internyay.util.CaseStatuses.WITHDRAWN_OUTCOME.equalsIgnoreCase(
                    h.getOutcome() == null ? "" : h.getOutcome().trim())) {
                h.setOutcome(null);
                hearingRepo.save(h);
            }
        }
    }

    // A withdrawn case set back to open goes back to the hearing date it was withdrawn on.
    // The Withdrawn mark is removed from that date's entry and the date is the next hearing again.
    // Returns the restored date, or null when there is none
    @Transactional
    public LocalDate reopenFromWithdrawn(Long caseId, Long userId) {
        for (Hearing h : hearingRepo.findByLegalCase_IdAndUser_IdOrderByDateDesc(caseId, userId)) {
            String outcome = h.getOutcome() == null ? "" : h.getOutcome().trim();
            if (!com.internyay.util.CaseStatuses.WITHDRAWN_OUTCOME.equalsIgnoreCase(outcome)) continue;

            LocalDate date = h.getDate();
            h.setOutcome(null);
            hearingRepo.save(h);
            return date;
        }
        return null;
    }

    // When a case is withdrawn, the day's hearing is marked as withdrawn
    @Transactional
    public void recordWithdrawn(Case legalCase, LocalDate date, Long userId) {
        if (date == null) return;

        Hearing h = hearingRepo.findByLegalCase_IdAndUser_IdAndDate(legalCase.getId(), userId, date)
                .orElseGet(() -> Hearing.builder()
                        .date(date)
                        .legalCase(legalCase)
                        .user(userRepo.getReferenceById(userId))
                        .build());

        if (blankToNull(h.getOutcome()) == null) {
            h.setOutcome(com.internyay.util.CaseStatuses.WITHDRAWN_OUTCOME);
        }

        hearingRepo.saveAndFlush(h);
        renumberOrders(legalCase.getId(), userId);
    }

    // Upload the court order for a hearing
    @Transactional
    public HearingDto attachOrder(Long hearingId, MultipartFile file, String name, Long userId)
            throws IOException {

        Hearing h = findOwned(hearingId, userId);

        String label = (name == null || name.isBlank())
                ? "Order — " + h.getDate()
                : name.trim();

        DocumentDto stored = documentService.store(
                file, label, "Order", h.getLegalCase().getId(), null, userId);

        detachOrder(h, userId);

        h.setOrderDocId(stored.getId());
        h.setOrderDocName(stored.getName());

        return saveAndNumber(h, userId);
    }

    // Keeps an order downloaded from eCourts as the order of the hearing. When the hearing already has an
    // order (another request was faster) nothing is stored again
    @Transactional
    public HearingDto attachFetchedOrder(Long hearingId, byte[] pdf, String fileName, Long userId) {

        Hearing h = findOwned(hearingId, userId);
        if (h.getOrderDocId() != null) return HearingDto.from(h);

        DocumentDto stored = documentService.storeBytes(
                pdf, fileName, "application/pdf",
                "Order — " + h.getDate(), "Order",
                h.getLegalCase().getId(), null, userId);

        h.setOrderDocId(stored.getId());
        h.setOrderDocName(stored.getName());
        h.setEcourtsOrderFile(fileName);

        return saveAndNumber(h, userId);
    }

    // The "Get order" button: downloads the order eCourts lists for the hearing's date and keeps it as the hearing's
    // order, so it can be opened, replaced and removed like one uploaded by hand. Not transactional on purpose: the
    // portal download can take a while and must not hold a database connection
    public HearingDto fetchOrder(Long hearingId, Long userId) {
        record Target(String cnr, java.time.LocalDate date, boolean declared) {}

        Target target = tx.execute(status -> {
            Hearing h = findOwned(hearingId, userId);
            return new Target(h.getLegalCase().getCnrNo(), h.getDate(),
                    ordersPolicy.forCase(h.getLegalCase()).declared());
        });
        if (target == null) throw new IllegalArgumentException("Hearing not found");

        HearingDto current = tx.execute(status -> HearingDto.from(findOwned(hearingId, userId)));
        if (current != null && current.getOrderDocId() != null) return current;

        if (!target.declared()) throw new IllegalArgumentException("Orders are not declared for this case");
        if (target.cnr() == null || target.cnr().isBlank()) {
            throw new IllegalArgumentException("This case has no CNR number, so its order cannot be read from eCourts");
        }

        ScrapingService.FetchedOrder order = scrapingService.fetchOrderForDate(target.cnr(), target.date())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Could not download the order from eCourts right now, please try again in a moment"));

        return tx.execute(status -> attachFetchedOrder(hearingId, order.pdf(), order.fileName(), userId));
    }

    // One hearing as the frontend sees it
    @Transactional(readOnly = true)
    public HearingDto toDto(Long hearingId, Long userId) {
        return HearingDto.from(findOwned(hearingId, userId));
    }

    // Detach and delete the order
    @Transactional
    public HearingDto removeOrder(Long hearingId, Long userId) {
        Hearing h = findOwned(hearingId, userId);
        detachOrder(h, userId);
        return saveAndNumber(h, userId);
    }

    // One hearing per case and date, update it or create it
    private Hearing upsert(Long caseId, LocalDate date, String notes, String outcome,
                           String time, Long userId) {

        Case legalCase = ownedCase(caseId, userId);

        Hearing h = hearingRepo.findByLegalCase_IdAndUser_IdAndDate(caseId, userId, date)
                .orElseGet(() -> Hearing.builder()
                        .date(date)
                        .legalCase(legalCase)
                        .user(userRepo.getReferenceById(userId))
                        .build());

        if (notes   != null) h.setNotes(blankToNull(notes));
        if (outcome != null) h.setOutcome(blankToNull(outcome));
        if (time    != null) h.setTime(blankToNull(time));

        return hearingRepo.save(h);
    }

    // Delete the stored order file, failures are ignored
    private void detachOrder(Hearing h, Long userId) {
        if (h.getOrderDocId() == null) return;

        try {
            documentService.delete(h.getOrderDocId(), userId);
        } catch (RuntimeException e) {
            log.debug("Order document {} for hearing {} could not be deleted: {}",
                    h.getOrderDocId(), h.getId(), e.getMessage());
        }

        h.setOrderDocId(null);
        h.setOrderDocName(null);
        h.setOrderSeq(null);
    }

    // Saves the hearing, then numbers the orders of its case again
    private HearingDto saveAndNumber(Hearing h, Long userId) {
        Hearing saved = hearingRepo.saveAndFlush(h);
        renumberOrders(saved.getLegalCase().getId(), userId);
        return HearingDto.from(saved);
    }

    // Orders are numbered one after another, oldest hearing date first, counting only the dates that have an order.
    // A date with no order does not take a number: if the 1st and 3rd dates have orders they are Order 1 and Order 2.
    // An order added, removed or moved to another date renumbers the ones after it
    @Transactional
    public void renumberOrders(Long caseId, Long userId) {
        int number = 0;
        for (Hearing h : hearingRepo.findWithOrdersInDateOrder(caseId, userId)) {

            // The link points to a document that no longer exists (an order of the older order system, or a file
            // removed by hand): the link is dropped, so the hearing is free again to get its order from eCourts.
            // Without this, one such hearing made every later upload / remove / delete on the case fail
            DocumentMeta meta;
            try {
                meta = documentService.getMeta(h.getOrderDocId());
            } catch (java.util.NoSuchElementException e) {
                log.warn("Hearing {} points to order document {} that does not exist, link removed", h.getId(), h.getOrderDocId());
                h.setOrderDocId(null);
                h.setOrderDocName(null);
                h.setOrderSeq(null);
                hearingRepo.save(h);
                continue;
            }

            number++;

            // The order date follows the hearing date, so a moved date updates the order title too
            boolean numberChanged = !java.util.Objects.equals(h.getOrderSeq(), number);
            boolean dateChanged = !h.getDate().equals(meta.getOrderDate());

            if (numberChanged || dateChanged) {
                h.setOrderSeq(number);
                hearingRepo.save(h);
                documentService.setOrderSeq(h.getOrderDocId(), number, h.getDate());
            }
        }
    }

    // The Refresh button: brings in every past hearing date eCourts lists that the case is missing, and the order file
    // of every date that has one. Existing entries are only completed, notes and attached orders are never touched
    public OldCaseImportService.Result syncEcourtsHistory(Long caseId, EcourtsCaseService.Snapshot snap, Long userId) {
        if (snap == null || snap.hearings().isEmpty()) return new OldCaseImportService.Result(0);
        OldCaseImportService.Result r = tx.execute(status -> {
            Case c = caseRepo.findById(caseId).orElse(null);
            if (c == null || !c.getUser().getId().equals(userId)) return new OldCaseImportService.Result(0);
            OldCaseImportService.Result done = oldCaseImport.importHistoryDetailed(c, snap, userId);
            hearingRepo.flush();
            renumberOrders(caseId, userId);
            return done;
        });
        return r == null ? new OldCaseImportService.Result(0) : r;
    }

    // Case must belong to the user
    private Case ownedCase(Long caseId, Long userId) {
        Case c = caseRepo.findById(caseId).orElseThrow(() -> new RuntimeException("Case not found"));
        if (!c.getUser().getId().equals(userId)) throw new RuntimeException("Forbidden");
        return c;
    }

    // Hearing must belong to the user
    private Hearing findOwned(Long id, Long userId) {
        Hearing h = hearingRepo.findById(id).orElseThrow(() -> new RuntimeException("Hearing not found"));
        if (!h.getUser().getId().equals(userId)) throw new RuntimeException("Forbidden");
        return h;
    }

    // Empty becomes null
    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}