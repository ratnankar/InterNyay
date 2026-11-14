package com.internyay.service;

import com.internyay.entity.CorporateAllotment;
import com.internyay.entity.CorporateSheet;
import com.internyay.entity.User;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.CorporateAllotmentRepository;
import com.internyay.repository.CorporateSheetRepository;
import com.internyay.repository.UserRepository;
import com.internyay.storage.FileStorage;
import com.internyay.util.CorporateSheetReader;
import com.internyay.util.Emails;
import com.internyay.util.PasswordPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.format.DateTimeFormatter;
import java.util.*;

// Corporate view: a firm on a corporate plan creates accounts for its hired advocates and allots cases to them in bulk by
// uploading its MIS spreadsheets (.xlsx). The hired advocate works in a normal advocate account and sees the allotted cases in their own list
@Service
@RequiredArgsConstructor
public class CorporateService {

    private static final long MAX_SHEET_BYTES = 30L * 1024 * 1024;
    // How many example rows are listed for each kind of problem in the result
    private static final int SAMPLES = 5;

    private final UserRepository userRepo;
    private final CorporateAllotmentRepository allotRepo;
    private final CorporateSheetRepository sheetRepo;
    private final CaseRepository caseRepo;
    private final PlanService planService;
    private final PasswordEncoder passwordEncoder;
    private final FileStorage storage;

    // ----- Shapes sent to the screens -----

    public record AdvocateRow(Long id, String name, String email, String phone, String barNo, boolean active, long allotted) {}

    public record AllotmentRow(Long id, String cnrNo, String ccNo, String courtName, String accused, String nextDate,
                               String caseStatus, Long advocateId, String advocateName, Long sheetId, String sheetName,
                               String batchId, String allottedOn, boolean added) {}

    // Rows that could not be allotted for one reason, with a few examples ("MIS row 12 (CC 4567/2024)")
    public record Skip(String reason, int count, List<String> examples) {}

    // What happened to one uploaded spreadsheet. rows = case rows read; every row ends up in exactly one of the five counts
    public record FileResult(String fileName, List<String> sheets, int rows, int allotted, int moved, int unchanged,
                             int duplicates, int skipped, List<Skip> skips, List<String> movedExamples, String error) {}

    public record AllotResult(String batchId, String advocateName, int allotted, int moved, int unchanged, int duplicates,
                              int skipped, int failedFiles, List<FileResult> files) {}

    // ----- Who may do what -----

    // The firm behind the signed-in account: an advocate account on a plan with the corporate feature, not a hired advocate
    public User requireFirm(User me) {
        if (me == null || !me.isAdvocate() || me.getCorporate() != null || !planService.hasFeature(me, "corporate")) {
            throw new AccessDeniedException("The corporate view needs a corporate plan");
        }
        return me;
    }

    // A hired advocate (an account a firm created)
    public User requireHired(User me) {
        if (me == null || !me.isAdvocate() || me.getCorporate() == null) {
            throw new AccessDeniedException("This account was not created by a corporate firm");
        }
        return me;
    }

    private User ownedAdvocate(User firm, Long advocateId) {
        User a = userRepo.findById(advocateId).orElseThrow(() -> new NoSuchElementException("Advocate not found"));
        if (a.getCorporate() == null || !a.getCorporate().getId().equals(firm.getId())) {
            throw new AccessDeniedException("This advocate does not belong to your firm");
        }
        return a;
    }

    // ----- Hired advocate accounts -----

    @Transactional(readOnly = true)
    public List<AdvocateRow> advocates(User firm) {
        List<AdvocateRow> rows = new ArrayList<>();
        for (User u : userRepo.findByCorporate_IdOrderByNameAsc(firm.getId())) {
            rows.add(new AdvocateRow(u.getId(), u.getName(), u.getEmail(), u.getPhone(), u.getBarNo(),
                    !Boolean.FALSE.equals(u.getActive()), allotRepo.countByAdvocate_Id(u.getId())));
        }
        return rows;
    }

    @Transactional
    public AdvocateRow createAdvocate(User firm, String name, String rawEmail, String phone, String barNo, String password) {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Enter the advocate's name");
        String email = Emails.normalize(rawEmail);
        if (email.isEmpty() || !email.contains("@")) throw new IllegalArgumentException("Enter a valid email");
        PasswordPolicy.require(password, email);
        planService.assertCorporateSeat(firm);
        if (userRepo.existsByEmailAndRole(email, User.ADMIN) || userRepo.existsByEmailAndRole(email, User.ADVOCATE)) {
            throw new IllegalArgumentException("An advocate account already exists for this email");
        }
        User user = User.builder()
                .name(name.trim())
                .email(email)
                .password(passwordEncoder.encode(password))
                .phone(phone == null ? null : phone.trim())
                .barNo(barNo == null || barNo.isBlank() ? null : barNo.trim())
                .role(User.ADVOCATE)
                .corporate(firm)
                .active(true)
                .build();
        try {
            User saved = userRepo.save(user);
            return new AdvocateRow(saved.getId(), saved.getName(), saved.getEmail(), saved.getPhone(), saved.getBarNo(), true, 0);
        } catch (DataIntegrityViolationException e) {
            throw new IllegalArgumentException("An advocate account already exists for this email");
        }
    }

    @Transactional
    public AdvocateRow setActive(User firm, Long advocateId, boolean active) {
        User a = ownedAdvocate(firm, advocateId);
        a.setActive(active);
        userRepo.save(a);
        return new AdvocateRow(a.getId(), a.getName(), a.getEmail(), a.getPhone(), a.getBarNo(), active, allotRepo.countByAdvocate_Id(a.getId()));
    }

    @Transactional
    public void resetPassword(User firm, Long advocateId, String password) {
        User a = ownedAdvocate(firm, advocateId);
        PasswordPolicy.require(password, a.getEmail());
        a.setPassword(passwordEncoder.encode(password));
        a.setPasswordChangedAt(java.time.LocalDateTime.now());
        userRepo.save(a);
    }

    // ----- Bulk allotment from the MIS spreadsheets -----

    // Reads the case rows of every spreadsheet and allots each CNR number to the advocate. A CNR the firm already allotted to
    // someone else is moved to this advocate; one already with this advocate stays (its MIS details are refreshed). Rows without a
    // usable CNR are reported, not guessed: the case is added later by its CNR number, so a CC number alone is not enough
    @Transactional
    public AllotResult allot(User firm, Long advocateId, List<MultipartFile> files, boolean skipClosed) {
        User advocate = ownedAdvocate(firm, advocateId);
        if (Boolean.FALSE.equals(advocate.getActive())) throw new IllegalArgumentException("This advocate account is deactivated");
        if (files == null || files.isEmpty()) throw new IllegalArgumentException("Choose at least one spreadsheet");

        String batchId = UUID.randomUUID().toString().replace("-", "").substring(0, 20);
        // One query for everything the firm already allotted, so a sheet of 17,000 rows does not mean 17,000 look-ups
        Map<String, CorporateAllotment> existing = new HashMap<>();
        for (CorporateAllotment a : allotRepo.findByFirmId(firm.getId())) existing.put(a.getCnrNo(), a);

        List<FileResult> results = new ArrayList<>();
        int allotted = 0, moved = 0, unchanged = 0, duplicates = 0, skipped = 0, failed = 0;

        for (MultipartFile f : files) {
            String name = f.getOriginalFilename() == null || f.getOriginalFilename().isBlank() ? "file.xlsx" : f.getOriginalFilename();
            try {
                FileResult r = allotFile(firm, advocate, f, name, batchId, skipClosed, existing);
                allotted += r.allotted(); moved += r.moved(); unchanged += r.unchanged();
                duplicates += r.duplicates(); skipped += r.skipped();
                results.add(r);
            } catch (IllegalArgumentException e) {
                failed++;
                results.add(new FileResult(name, List.of(), 0, 0, 0, 0, 0, 0, List.of(), List.of(), e.getMessage()));
            }
        }
        return new AllotResult(batchId, advocate.getName(), allotted, moved, unchanged, duplicates, skipped, failed, results);
    }

    private FileResult allotFile(User firm, User advocate, MultipartFile f, String name, String batchId, boolean skipClosed,
                                 Map<String, CorporateAllotment> existing) {
        if (f.isEmpty()) throw new IllegalArgumentException("The file is empty");
        if (f.getSize() > MAX_SHEET_BYTES) throw new IllegalArgumentException("The file is larger than 30 MB");
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".xls") || lower.endsWith(".csv")) {
            throw new IllegalArgumentException("Only .xlsx spreadsheets can be read. Open the file in Excel and save it as .xlsx");
        }
        byte[] bytes;
        CorporateSheetReader.Result sheet;
        try {
            bytes = f.getBytes();
            sheet = CorporateSheetReader.read(bytes);
        } catch (java.io.IOException e) {
            throw new IllegalArgumentException("This is not a readable .xlsx spreadsheet");
        }
        if (sheet.sheetsRead().isEmpty()) {
            throw new IllegalArgumentException("No sheet with a CNR column was found (looked for CNR NO, CNRNO, CRN NO or CRN NUMBER)");
        }

        String key = FileStorage.newKey("corporate");
        storage.put(key, new java.io.ByteArrayInputStream(bytes), bytes.length,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        CorporateSheet saved;
        try {
            saved = sheetRepo.save(CorporateSheet.builder().firmId(firm.getId()).fileName(name).storageKey(key).build());
        } catch (RuntimeException e) {
            storage.delete(key);
            throw e;
        }

        // Skipped rows are grouped by reason so a sheet with 2,400 blank CNR cells is one line in the result
        Map<String, int[]> skipCounts = new LinkedHashMap<>();
        Map<String, List<String>> skipExamples = new HashMap<>();
        Set<String> seen = new HashSet<>();
        List<CorporateAllotment> fresh = new ArrayList<>(), changed = new ArrayList<>();
        List<String> movedExamples = new ArrayList<>();
        int a = 0, m = 0, u = 0, dup = 0;

        for (CorporateSheetReader.Row row : sheet.rows()) {
            String where = "Sheet " + row.sheet() + ", row " + row.rowNo() + (row.ccNo() == null ? "" : " (CC " + row.ccNo() + ")");
            if (row.cnr() == null) {
                String reason = row.rawCnr() == null
                        ? "No CNR number in the sheet (the CNR cell is empty or #N/A)"
                        : "The CNR column holds a remark, not a CNR number";
                skip(skipCounts, skipExamples, reason, row.rawCnr() == null ? where : where + ": " + abbreviate(row.rawCnr(), 40));
                continue;
            }
            if (skipClosed && row.closed()) {
                skip(skipCounts, skipExamples, "Disposed or withdrawn case (left out as you chose)", where + ": " + row.cnr());
                continue;
            }
            if (!seen.add(row.cnr())) { dup++; continue; }

            CorporateAllotment cur = existing.get(row.cnr());
            if (cur == null) {
                CorporateAllotment n = CorporateAllotment.builder().firmId(firm.getId()).advocate(advocate)
                        .sheetId(saved.getId()).cnrNo(row.cnr()).batchId(batchId).build();
                fill(n, row);
                fresh.add(n);
                existing.put(row.cnr(), n);
                a++;
            } else if (!cur.getAdvocate().getId().equals(advocate.getId())) {
                cur.setAdvocate(advocate);
                cur.setSheetId(saved.getId());
                cur.setBatchId(batchId);
                fill(cur, row);
                changed.add(cur);
                if (movedExamples.size() < SAMPLES) movedExamples.add(row.cnr());
                m++;
            } else {
                if (fill(cur, row)) changed.add(cur);
                u++;
            }
        }
        allotRepo.saveAll(fresh);
        allotRepo.saveAll(changed);

        List<Skip> skips = new ArrayList<>();
        int skippedTotal = 0;
        for (Map.Entry<String, int[]> e : skipCounts.entrySet()) {
            skips.add(new Skip(e.getKey(), e.getValue()[0], skipExamples.get(e.getKey())));
            skippedTotal += e.getValue()[0];
        }
        return new FileResult(name, sheet.sheetsRead(), sheet.rows().size(), a, m, u, dup, skippedTotal, skips, movedExamples, null);
    }

    private static void skip(Map<String, int[]> counts, Map<String, List<String>> examples, String reason, String example) {
        counts.computeIfAbsent(reason, k -> new int[1])[0]++;
        List<String> list = examples.computeIfAbsent(reason, k -> new ArrayList<>());
        if (list.size() < SAMPLES) list.add(example);
    }

    private static String abbreviate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    private static String cut(String s, int max) {
        return s == null ? null : s.length() <= max ? s : s.substring(0, max);
    }

    // Copies the MIS details onto the allotment; true when something changed
    private static boolean fill(CorporateAllotment a, CorporateSheetReader.Row row) {
        String cc = cut(row.ccNo(), 60), court = cut(row.court(), 120), accused = cut(row.accused(), 255), status = cut(row.status(), 80);
        boolean changed = !Objects.equals(a.getCcNo(), cc) || !Objects.equals(a.getCourtName(), court)
                || !Objects.equals(a.getAccused(), accused) || !Objects.equals(a.getNextDate(), row.nextDate())
                || !Objects.equals(a.getCaseStatus(), status);
        a.setCcNo(cc); a.setCourtName(court); a.setAccused(accused); a.setNextDate(row.nextDate()); a.setCaseStatus(status);
        return changed;
    }

    // ----- Allotment lists -----

    // The firm's allotments, newest first; filtered by advocate and by search text (CNR or CC number, accused, court, advocate, file)
    @Transactional(readOnly = true)
    public List<AllotmentRow> firmAllotments(User firm, Long advocateId, String search) {
        List<CorporateAllotment> all = advocateId == null
                ? allotRepo.findByFirmIdOrderByIdDesc(firm.getId())
                : allotRepo.findByFirmIdOrderByIdDesc(firm.getId()).stream()
                        .filter(a -> a.getAdvocate().getId().equals(advocateId)).toList();
        List<AllotmentRow> rows = rowsOf(all);
        String q = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
        if (q.isEmpty()) return rows;
        return rows.stream().filter(r -> has(r.cnrNo(), q) || has(r.ccNo(), q) || has(r.accused(), q) || has(r.courtName(), q)
                || has(r.advocateName(), q) || has(r.sheetName(), q)).toList();
    }

    private static boolean has(String value, String q) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(q);
    }

    // Cases allotted to a hired advocate
    @Transactional(readOnly = true)
    public List<AllotmentRow> mine(User advocate) {
        return rowsOf(allotRepo.findByAdvocate_IdOrderByIdDesc(advocate.getId()));
    }

    private List<AllotmentRow> rowsOf(List<CorporateAllotment> all) {
        if (all.isEmpty()) return List.of();
        Set<Long> sheetIds = new HashSet<>(), advocateIds = new HashSet<>();
        for (CorporateAllotment a : all) {
            if (a.getSheetId() != null) sheetIds.add(a.getSheetId());
            advocateIds.add(a.getAdvocate().getId());
        }
        Map<Long, String> names = new HashMap<>();
        if (!sheetIds.isEmpty()) for (Object[] r : sheetRepo.namesOf(sheetIds)) names.put((Long) r[0], (String) r[1]);
        // A case counts as added once the advocate has it in their own list (one query for all of them)
        Set<String> addedKeys = new HashSet<>();
        for (Object[] r : caseRepo.cnrNosOfUsers(advocateIds)) addedKeys.add(r[0] + "|" + r[1]);
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd-MM-yyyy");
        List<AllotmentRow> rows = new ArrayList<>(all.size());
        for (CorporateAllotment a : all) {
            Long advId = a.getAdvocate().getId();
            rows.add(new AllotmentRow(a.getId(), a.getCnrNo(), a.getCcNo(), a.getCourtName(), a.getAccused(),
                    a.getNextDate() == null ? null : a.getNextDate().format(fmt), a.getCaseStatus(),
                    advId, a.getAdvocate().getName(), a.getSheetId(), a.getSheetId() == null ? null : names.get(a.getSheetId()),
                    a.getBatchId(), a.getUpdatedAt().format(fmt), addedKeys.contains(advId + "|" + a.getCnrNo().toUpperCase(Locale.ROOT))));
        }
        return rows;
    }

    // Moves an allotted case to another hired advocate of the firm
    @Transactional
    public void reassign(User firm, Long allotmentId, Long advocateId) {
        CorporateAllotment a = firmAllotment(firm, allotmentId);
        User advocate = ownedAdvocate(firm, advocateId);
        if (Boolean.FALSE.equals(advocate.getActive())) throw new IllegalArgumentException("This advocate account is deactivated");
        a.setAdvocate(advocate);
        allotRepo.save(a);
    }

    // Takes an allotment back (a case the advocate already added stays in their list)
    @Transactional
    public void remove(User firm, Long allotmentId) {
        allotRepo.delete(firmAllotment(firm, allotmentId));
    }

    private CorporateAllotment firmAllotment(User firm, Long id) {
        CorporateAllotment a = allotRepo.findById(id).orElseThrow(() -> new NoSuchElementException("Allotment not found"));
        if (!a.getFirmId().equals(firm.getId())) throw new AccessDeniedException("Not your allotment");
        return a;
    }

    // ----- Spreadsheets -----

    // The bytes of a stored spreadsheet
    public byte[] bytesOf(CorporateSheet sheet) {
        try (java.io.InputStream in = storage.open(sheet.getStorageKey())) {
            return in.readAllBytes();
        } catch (java.io.IOException e) {
            throw new IllegalStateException("The spreadsheet could not be read");
        }
    }

    // A stored spreadsheet, only for the firm that uploaded it
    @Transactional(readOnly = true)
    public CorporateSheet sheetFor(User firm, Long sheetId) {
        CorporateSheet sheet = sheetRepo.findById(sheetId).orElseThrow(() -> new NoSuchElementException("Spreadsheet not found"));
        if (!sheet.getFirmId().equals(firm.getId())) throw new AccessDeniedException("Not your spreadsheet");
        return sheet;
    }
}
