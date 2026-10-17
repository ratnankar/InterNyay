package com.internyay.service;

import com.internyay.dto.*;
import com.internyay.entity.*;
import com.internyay.repository.*;
import com.internyay.util.CaseCatalog;
import com.internyay.util.CaseStatuses;
import com.internyay.util.FeeMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

// Create, update, list and delete cases, always scoped to the owning advocate
@Service
@RequiredArgsConstructor
public class CaseService {

    private final OptionService options;
    private final CourtService courtService;
    private final com.internyay.repository.PoliceStationRepository policeStationRepo;

    private final CaseRepository caseRepo;
    private final ClientRepository clientRepo;
    private final UserRepository userRepo;
    private final DocumentService documentService;
    private final HearingDayService hearingDays;
    private final HearingRepository hearingRepo;
    private final JudgeService judgeService;
    private final FileNumberService fileNumbers;
    private final HearingService hearingService;
    private final EcourtsCaseService ecourtsCases;
    private final OldCaseImportService oldCaseImport;

    // Newest first, filtered by search, status, type and client.
    // Must run in a transaction: CaseDto.from reads lazy relations (client, additional clients, fees, sub types)
    // and open-in-view is off, so without a session the list fails with LazyInitializationException.
    @Transactional(readOnly = true)
    public Page<CaseDto> list(Long userId, String search, String status, String type,
                              Long clientId, int page, int size) {

        Pageable p = PageRequest.of(page, size, Sort.by("createdAt").descending());

        Page<Case> cases = caseRepo.findByFilters(
                userId, blank(search), blank(status), blank(type), clientId, p);

        Map<Long, List<DocumentDto>> docs = documentService.mapByCaseIds(
                cases.getContent().stream().map(Case::getId).toList());

        Map<Long, String> judges = judgeService.judgeNamesFor(cases.getContent());

        return cases.map(c -> withJudge(
                CaseDto.from(c, docs.getOrDefault(c.getId(), List.of())), judges.get(c.getId())));
    }

    private static final String CNR_REQUIRED = "Enter the 16-character CNR number";

    // A CNR that is sent must be a valid one: it cannot be cleared or replaced by something that is not a CNR.
    // (A request that does not send the CNR leaves it as it is, so other edits to an older case still work)
    private static String requireCnr(String raw) {
        String cnr = EcourtsCaseService.normalizeCnr(raw);
        if (cnr == null) throw new IllegalArgumentException(CNR_REQUIRED);
        return cnr;
    }

    // Validates the client belongs to the user, then fills dates, court, classification and parties
    @Transactional
    public CaseDto create(CaseRequest req, Long userId) {

        User user = userRepo.getReferenceById(userId);
        Client client = ownedClient(req.getClientId(), userId);

        // Every case needs its 16-character CNR number, stored without spaces or dashes in capitals
        String cnr = EcourtsCaseService.normalizeCnr(req.getCnrNo());
        if (cnr == null) throw new IllegalArgumentException(CNR_REQUIRED);

        // An old case is read from eCourts first, so nothing is created when eCourts cannot be reached
        EcourtsCaseService.Snapshot snap = req.isOldCase() ? ecourtsCases.fetch(req.getCnrNo()) : null;

        LocalDate nextHearing;
        String status = req.getStatus() != null ? req.getStatus() : "Pending";

        if (snap != null) {
            // The date and status come from the court, so the closed-day check does not apply
            if (snap.disposed()) {
                status = snap.withdrawn() ? CaseStatuses.WITHDRAWN : CaseStatuses.DECIDED;
                nextHearing = null;
            } else {
                nextHearing = snap.nextHearing();
            }
        } else {
            nextHearing = parseDate("Next hearing date", req.getNextHearing());
            hearingDays.assertAllowed(nextHearing, userId);
        }

        Case c = Case.builder()
                .title(req.getTitle())
                .caseNo(req.getCaseNo())
                .cnrNo(cnr)
                .status(status)
                .description(req.getDescription())
                .nextHearing(nextHearing)
                .client(client)
                .user(user)
                .build();

        applyCourt(c, req.getCourt(), req.getDistrict());
        c.setCourtNo(courtService.requireCourtNo(c.getCourtPlace(), req.getCourtNo()));
        c.setAdditionalClients(resolveAdditionalClients(req.getAdditionalClientIds(), client.getId(), userId));
        applyClassification(c, req);
        applyFilingAndParties(c, req);
        applyClientSubTypes(c, req.getClientSubTypes());
        numberNewCase(c, req, userId);

        FeeMapper.applyFeeFields(c, req);

        Case saved = caseRepo.save(c);

        if (snap != null) oldCaseImport.importHistory(saved, snap, userId);

        if (saved.getNextHearing() != null) {
            hearingService.recordHeard(saved, saved.getNextHearing(), userId);
        }

        return toDto(saved);
    }

    // Partial update, also keeps the file number in step when the status or client changes
    @Transactional
    public CaseDto update(Long id, CaseRequest req, Long userId) {

        Case c = findOwned(id, userId);

        boolean wasCorporatePanel = isCorporatePanel(c);
        boolean wasClosed = CaseStatuses.isClosed(c.getStatus());
        boolean wasWithdrawn = CaseStatuses.isWithdrawn(c.getStatus());

        if (req.getTitle()       != null) c.setTitle(req.getTitle());
        if (req.getCaseNo()      != null) c.setCaseNo(req.getCaseNo());
        if (req.getFileNo()      != null) c.setFileNo(req.getFileNo());
        if (req.getCnrNo()       != null) c.setCnrNo(requireCnr(req.getCnrNo()));
        Court previousPlace = c.getCourtPlace();
        if (req.getCourt()       != null) applyCourt(c, req.getCourt(), req.getDistrict());
        applyCourtNo(c, req, previousPlace);
        if (req.getStatus()      != null) c.setStatus(req.getStatus());
        if (req.getDescription() != null) c.setDescription(req.getDescription());
        applyClassification(c, req);
        applyFilingAndParties(c, req);
        if (req.getNextHearing() != null) {
            LocalDate nextHearing = parseDate("Next hearing date", req.getNextHearing());

            if (!Objects.equals(nextHearing, c.getNextHearing())) {
                hearingDays.assertAllowed(nextHearing, userId, c.getId());
                // The date being replaced stays in the hearing history
                if (nextHearing != null) hearingService.recordHeard(c, c.getNextHearing(), userId);
                c.setCauseListNo(null);
                c.setListingDate(null);
            }
            c.setNextHearing(nextHearing);

            if (nextHearing != null) hearingService.recordHeard(c, nextHearing, userId);
        }

        if (CaseStatuses.isWithdrawn(c.getStatus()) && c.getNextHearing() != null) {
            if (!wasWithdrawn) {
                hearingService.recordWithdrawn(c, c.getNextHearing(), userId);
            }
            c.setNextHearing(null);
            c.setCauseListNo(null);
            c.setListingDate(null);
        }

        // Reopened from Withdrawn: the Withdrawn mark goes from the hearing history
        if (wasWithdrawn && !CaseStatuses.isWithdrawn(c.getStatus())) {
            if (CaseStatuses.isClosed(c.getStatus())) {
                // Withdrawn -> Decided: the case stays closed, only the Withdrawn mark goes
                hearingService.clearWithdrawn(c.getId(), userId);
            } else {
                // Withdrawn -> open: the hearing it was withdrawn on becomes the next hearing again,
                // unless a new date was given in the same update
                LocalDate restored = hearingService.reopenFromWithdrawn(c.getId(), userId);
                if (restored != null && c.getNextHearing() == null) {
                    c.setNextHearing(restored);
                }
            }
        }

        if (req.getClientId() != null && !req.getClientId().equals(c.getClient().getId())) {
            c.setClient(ownedClient(req.getClientId(), userId));
        }

        if (req.getAdditionalClientIds() != null) {
            c.getAdditionalClients().clear();
            c.getAdditionalClients().addAll(
                    resolveAdditionalClients(req.getAdditionalClientIds(), c.getClient().getId(), userId));
        }

        applyClientSubTypes(c, req.getClientSubTypes());

        syncFileNumber(c, req, userId, wasCorporatePanel, wasClosed);

        FeeMapper.applyFeeFields(c, req);

        Case saved = caseRepo.save(c);
        return toDto(saved);
    }

    // Soft delete: documents and hearings go, the case row stays hidden so history and file numbers survive
    @Transactional
    public void delete(Long id, Long userId) {
        Case c = findOwned(id, userId);

        documentService.deleteAllForCase(c.getId());
        hearingRepo.deleteByLegalCase_Id(c.getId());

        c.setStatus(CaseStatuses.DECIDED);
        c.setNextHearing(null);
        c.setCauseListNo(null);
        c.setListingDate(null);
        // Case number is tagged so it can be reused for a new case
        c.setCaseNo(c.getCaseNo() + "#deleted-" + c.getId());
        c.setDeleted(true);
        c.setDeletedAt(LocalDateTime.now());
        caseRepo.save(c);
    }

    // Corporate panel cases use a typed file number, the others get the next free sequence
    private void numberNewCase(Case c, CaseRequest req, Long userId) {

        if (isCorporatePanel(c)) {
            c.setFileNo(trimmedOrNull(req.getFileNo()));
            c.setFileSeq(null);
            return;
        }

        fileNumbers.assign(c, userId, req.getFileSeq());
    }

    // Re-number only when needed: left corporate panel, or a reopened case clashing with an open one
    private void syncFileNumber(Case c, CaseRequest req, Long userId,
                                boolean wasCorporatePanel, boolean wasClosed) {

        if (isCorporatePanel(c)) {
            c.setFileSeq(null);
            return;
        }

        Integer current = c.getFileSeq();

        // A case that had no sequence number yet and now needs one
        boolean needsFirstNumber = current == null && (wasCorporatePanel || req.getFileSeq() != null);

        // Reopened case whose number is already held by another open case
        boolean reopenedIntoClash = current != null
                && wasClosed && !CaseStatuses.isClosed(c.getStatus())
                && caseRepo.countOpenHolders(userId, current, c.getId()) > 0;

        if (needsFirstNumber) {
            fileNumbers.assign(c, userId, req.getFileSeq());
        } else if (reopenedIntoClash) {
            fileNumbers.assign(c, userId, null);
        } else if (current != null) {
            c.setFileNo(String.valueOf(current));
        }
    }

    // True when the main client or any additional client is a corporate panel client
    private boolean isCorporatePanel(Case c) {
        if (isPanelClient(c.getClient())) return true;

        return c.getAdditionalClients() != null
                && c.getAdditionalClients().stream().anyMatch(this::isPanelClient);
    }

    // Corporate panel is a label set on the client
    private boolean isPanelClient(Client client) {
        return client != null && client.getCustomLabel() == Client.CustomLabel.CORPORATE_PANEL;
    }

    // Links the case to its row in the court table: a high court has no district, any other court
    // must match a court and district that are in the table. Court and district are then read from that row
    private void applyCourt(Case c, String court, String district) {
        c.setCourtPlace(courtService.placeOf(court, district));
    }

    // Court no. must be in the court table for the case's court and district. A court no. the case already
    // holds at the same court is kept as it is, so old cases can still be edited; anything changed is checked
    private void applyCourtNo(Case c, CaseRequest req, Court previousPlace) {
        if (req.getCourtNo() == null) return;

        boolean samePlace = previousPlace != null && c.getCourtPlace() != null
                && previousPlace.getId().equals(c.getCourtPlace().getId());
        String current = c.getCourtNo() == null ? "" : c.getCourtNo().trim();
        if (samePlace && req.getCourtNo().trim().equalsIgnoreCase(current)) return;

        c.setCourtNo(courtService.requireCourtNo(c.getCourtPlace(), req.getCourtNo()));
    }

    // The station row for the typed name: the one in the case's court when several stations share the name,
    // null when the name is empty, unknown or still ambiguous
    private Long resolvePoliceStationId(Case c) {
        String name = c.getPoliceStation();
        if (name == null || name.isBlank()) return null;

        List<Long> ids = policeStationRepo.idsByName(name.trim());
        if (ids.size() == 1) return ids.get(0);
        if (ids.size() > 1 && c.getCourtPlace() != null) {
            List<Long> inCourt = policeStationRepo.idsByNameAndCourt(name.trim(), c.getCourtPlace().getCourt());
            if (inCourt.size() == 1) return inCourt.get(0);
        }
        return null;
    }

    // Case nature, relief sought, case type and the police challan fields
    private void applyClassification(Case c, CaseRequest req) {

        if (req.getCaseNature()   != null) c.setCaseNature(CaseCatalog.canonicalNature(req.getCaseNature()));
        if (req.getReliefSought() != null) c.setReliefSought(trimmedOrNull(req.getReliefSought()));
        if (req.getCaseType()     != null) c.setCaseType(trimmedOrNull(req.getCaseType()));

        if (req.getFirNo()         != null) c.setFirNo(trimmedOrNull(req.getFirNo()));
        if (req.getFirSection()    != null) c.setFirSection(trimmedOrNull(req.getFirSection()));
        if (req.getPoliceStation() != null) c.setPoliceStation(trimmedOrNull(req.getPoliceStation()));

        if (!CaseCatalog.isPoliceChallan(c.getReliefSought())) {
            c.setFirNo(null);
            c.setFirSection(null);
            c.setPoliceStation(null);
        }
        c.setPoliceStationId(resolvePoliceStationId(c));

        if (req.getChequeNo()       != null) c.setChequeNo(trimmedOrNull(req.getChequeNo()));
        if (req.getChequeDate()     != null) c.setChequeDate(parseDate("Cheque date", req.getChequeDate()));
        if (req.getMemoDate()       != null) c.setMemoDate(parseDate("Memo date", req.getMemoDate()));
        if (req.getBouncingReason() != null) c.setBouncingReason(trimmedOrNull(req.getBouncingReason()));
        if (req.getClaimAmount()    != null) c.setClaimAmount(parseClaimAmount(req.getClaimAmount()));
        if (req.getNoticeDate()     != null) c.setNoticeDate(parseDate("Notice date", req.getNoticeDate()));

        if (!CaseCatalog.isNiAct138Complaint(c.getCaseType())) {
            c.setChequeNo(null);
            c.setChequeDate(null);
            c.setMemoDate(null);
            c.setBouncingReason(null);
            c.setClaimAmount(null);
            c.setNoticeDate(null);
        }
    }

    // Filing date, client side, opposing party and claim details
    private void applyFilingAndParties(Case c, CaseRequest req) {

        if (req.getFilingDate()    != null) c.setFilingDate(parseDate("Filing date", req.getFilingDate()));
        if (req.getClientSide()    != null) c.setClientSide(CaseCatalog.canonicalSide(req.getClientSide()));
        if (req.getOpposingParty() != null) c.setOpposingParty(trimmedOrNull(req.getOpposingParty()));
        if (req.getOpposingFatherName() != null) c.setOpposingFatherName(trimmedOrNull(req.getOpposingFatherName()));
        if (req.getOpposingAddress() != null) c.setOpposingAddress(trimmedOrNull(req.getOpposingAddress()));
        if (req.getOpposingPhone() != null) c.setOpposingPhone(trimmedOrNull(req.getOpposingPhone()));
    }

    // Accepts ISO dates only, the label is used in the error message
    private LocalDate parseDate(String label, String raw) {
        if (raw == null || raw.isBlank()) return null;

        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(label + " must be a valid date (yyyy-MM-dd)");
        }
    }

    // Claim amount as a number, invalid text is rejected
    private BigDecimal parseClaimAmount(String raw) {
        if (raw == null || raw.isBlank()) return null;

        try {
            BigDecimal amount = new BigDecimal(raw.trim());
            if (amount.signum() < 0) throw new IllegalArgumentException("Claim amount cannot be negative");
            return amount;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Claim amount must be a number");
        }
    }

    // Case plus its documents and the judge matched by court number
    private CaseDto toDto(Case c) {
        return withJudge(CaseDto.from(c, documentService.listForOwnedCase(c.getId())),
                judgeService.judgeNamesFor(List.of(c)).get(c.getId()));
    }

    // Adds the judge name to the DTO
    private CaseDto withJudge(CaseDto dto, String judgeName) {
        dto.setJudgeName(judgeName);
        return dto;
    }

    // Per-client role on this case, only for clients that are actually on the case
    private void applyClientSubTypes(Case c, Map<Long, String> requested) {

        Set<Long> onCase = new HashSet<>();
        onCase.add(c.getClient().getId());
        c.getAdditionalClients().forEach(x -> onCase.add(x.getId()));

        Map<Long, String> current = c.getClientSubTypes();
        current.keySet().removeIf(id -> !onCase.contains(id));

        if (requested == null) return;

        requested.forEach((clientId, value) -> {
            if (clientId == null || !onCase.contains(clientId)) return;

            String subType = canonicalSubType(value, current.get(clientId));
            if (subType == null) current.remove(clientId);
            else current.put(clientId, subType);
        });
    }

    // Role in its saved spelling. The list is managed by the admin; a role already saved on the case stays valid even after the admin removes it.
    private String canonicalSubType(String value, String alreadySaved) {
        if (value == null || value.isBlank()) return null;

        String wanted = value.trim();
        String known = options.canonical("CLIENT_SUBTYPE", wanted);
        if (known != null) return known;
        if (alreadySaved != null && alreadySaved.equalsIgnoreCase(wanted)) return alreadySaved;
        throw new IllegalArgumentException("Invalid client sub-type \"" + wanted + "\"");
    }

    // Client must exist and belong to this advocate
    private Client ownedClient(Long clientId, Long userId) {
        Client client = clientRepo.findById(clientId)
                .orElseThrow(() -> new RuntimeException("Client not found"));

        if (!client.getUser().getId().equals(userId)) throw new RuntimeException("Forbidden");
        return client;
    }

    // Extra clients on the case, duplicates and the primary client removed
    private List<Client> resolveAdditionalClients(List<Long> ids, Long primaryClientId, Long userId) {
        if (ids == null || ids.isEmpty()) return new ArrayList<>();

        Set<Long> unique = new LinkedHashSet<>(ids);
        unique.remove(primaryClientId);

        List<Client> clients = new ArrayList<>();
        for (Long id : unique) clients.add(ownedClient(id, userId));
        return clients;
    }

    // Case by id, rejected when it belongs to someone else
    private Case findOwned(Long id, Long userId) {
        Case c = caseRepo.findById(id).orElseThrow(() -> new RuntimeException("Case not found"));
        if (!c.getUser().getId().equals(userId)) throw new RuntimeException("Forbidden");
        return c;
    }

    private String blank(String s) { return (s == null || s.isBlank()) ? null : s; }

    private String trimmedOrNull(String s) { return (s == null || s.isBlank()) ? null : s.trim(); }
}