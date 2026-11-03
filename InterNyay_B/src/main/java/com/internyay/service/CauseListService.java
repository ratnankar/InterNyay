package com.internyay.service;

import com.internyay.entity.Case;
import com.internyay.repository.CaseRepository;
import com.internyay.scraper.CauseListMatcher;
import com.internyay.scraper.DelhiHighCourtCauseListClient;
import com.internyay.scraper.DelhiHighCourtCauseListClient.CauseListDocument;
import com.internyay.scraper.ItemNoFinder;
import com.internyay.scraper.SupremeCourtCauseListClient;
import com.internyay.scraper.SupremeCourtCauseListMatcher;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;

@Service
@Slf4j
public class CauseListService {

    private final CaseRepository caseRepo;
    private final CourtService courtService;
    private final DelhiHighCourtCauseListClient delhiHighCourt;
    private final boolean delhiHighCourtEnabled;
    private final String delhiHighCourtName;
    private final SupremeCourtCauseListClient supremeCourt;
    private final boolean supremeCourtEnabled;
    private final String supremeCourtName;

    public CauseListService(
            CaseRepository caseRepo,
            CourtService courtService,
            DelhiHighCourtCauseListClient delhiHighCourt,
            SupremeCourtCauseListClient supremeCourt,
            @Value("${causelist.delhihc.enabled:true}") boolean delhiHighCourtEnabled,
            @Value("${causelist.delhihc.court-name:Delhi High Court}") String delhiHighCourtName,
            @Value("${causelist.sci.enabled:true}") boolean supremeCourtEnabled,
            @Value("${causelist.sci.court-name:Supreme Court of India}") String supremeCourtName) {

        this.caseRepo = caseRepo;
        this.courtService = courtService;
        this.delhiHighCourt = delhiHighCourt;
        this.supremeCourt = supremeCourt;
        this.delhiHighCourtEnabled = delhiHighCourtEnabled;
        this.delhiHighCourtName = delhiHighCourtName == null ? "" : delhiHighCourtName.trim();
        this.supremeCourtEnabled = supremeCourtEnabled;
        this.supremeCourtName = supremeCourtName == null ? "" : supremeCourtName.trim();
    }

    public record Result(LocalDate hearingDate, int casesChecked, int causeListNosSaved) {}

    public Result fetchFor(LocalDate hearingDate) {
        return fetchFor(hearingDate, false);
    }

    public Result fetchFor(LocalDate hearingDate, boolean onlyMissing) {

        Predicate<Case> juvenile = courtService.juvenileBoardCases();

        List<Case> pending = caseRepo.findByNextHearing(hearingDate).stream()
                .filter(c -> !juvenile.test(c))
                .filter(c -> !(onlyMissing && c.getCauseListNo() != null && hearingDate.equals(c.getListingDate())))
                .toList();

        // Delhi High Court and Supreme Court cases are read here, from the courts' published PDFs.
        // District court cases are filled through the admin Cause List relay (CAPTCHA).
        List<Case> delhiHcCases = pending.stream().filter(this::isDelhiHighCourt).toList();
        List<Case> supremeCourtCases = pending.stream().filter(this::isSupremeCourt).toList();

        int saved = saveFromPdf("Delhi High Court", hearingDate, delhiHcCases,
                () -> delhiHighCourt.fetch(hearingDate), CauseListMatcher::new);

        saved += saveFromPdf("Supreme Court", hearingDate, supremeCourtCases,
                () -> supremeCourt.fetch(hearingDate), SupremeCourtCauseListMatcher::new);

        return new Result(hearingDate, delhiHcCases.size() + supremeCourtCases.size(), saved);
    }

    // What a single-case lookup found: whether the court has published a list for the date, and the case's item number in it
    public record CaseLookup(boolean listPublished, Integer itemNo) {}

    // True when this case's cause list is read from a High Court / Supreme Court PDF (no CAPTCHA involved)
    public boolean readsFromPdf(Case c) {
        return isDelhiHighCourt(c) || isSupremeCourt(c);
    }

    // Looks one case up in the court's published PDF for the date. Only reads, saving is left to the caller
    public CaseLookup lookUpCase(Case c, LocalDate hearingDate) {
        List<CauseListDocument> documents;
        Function<List<String>, ? extends ItemNoFinder> matcherFor;

        if (isDelhiHighCourt(c)) {
            documents = delhiHighCourt.fetch(hearingDate);
            matcherFor = CauseListMatcher::new;
        } else if (isSupremeCourt(c)) {
            documents = supremeCourt.fetch(hearingDate);
            matcherFor = SupremeCourtCauseListMatcher::new;
        } else {
            return new CaseLookup(false, null);
        }

        if (documents.isEmpty()) return new CaseLookup(false, null);

        for (CauseListDocument document : documents) {
            Optional<Integer> itemNo = matcherFor.apply(document.lines()).findItemNo(c.getCaseNo());
            if (itemNo.isPresent()) return new CaseLookup(true, itemNo.get());
        }
        return new CaseLookup(true, null);
    }

    private boolean isDelhiHighCourt(Case c) {
        return delhiHighCourtEnabled && isCourt(c, delhiHighCourtName);
    }

    private boolean isSupremeCourt(Case c) {
        return supremeCourtEnabled && isCourt(c, supremeCourtName);
    }

    private boolean isCourt(Case c, String courtName) {
        return c.getCourtPlace() != null
                && c.getCourtPlace().isHighCourt()
                && c.getCourtPlace().getCourt() != null
                && c.getCourtPlace().getCourt().trim().equalsIgnoreCase(courtName);
    }

    private int saveFromPdf(String courtLabel, LocalDate hearingDate, List<Case> cases,
                            Supplier<List<CauseListDocument>> download,
                            Function<List<String>, ? extends ItemNoFinder> matcherFor) {

        if (cases.isEmpty()) return 0;

        List<CauseListDocument> documents = download.get();

        if (documents.isEmpty()) return 0;

        Map<Long, Case> pending = new LinkedHashMap<>();
        cases.forEach(c -> pending.put(c.getId(), c));

        Map<Integer, List<Long>> idsByItemNo = new HashMap<>();

        for (CauseListDocument document : documents) {

            if (pending.isEmpty()) break;

            ItemNoFinder matcher = matcherFor.apply(document.lines());
            Iterator<Case> iterator = pending.values().iterator();

            while (iterator.hasNext()) {
                Case c = iterator.next();
                Optional<Integer> itemNo = matcher.findItemNo(c.getCaseNo());

                if (itemNo.isPresent()) {
                    idsByItemNo.computeIfAbsent(itemNo.get(), k -> new ArrayList<>()).add(c.getId());
                    iterator.remove();
                    log.debug("Case {} found at item {} in '{}'", c.getId(), itemNo.get(), document.title());
                }
            }
        }

        int saved = 0;

        for (Map.Entry<Integer, List<Long>> entry : idsByItemNo.entrySet()) {
            saved += caseRepo.saveCauseListNo(entry.getKey(), hearingDate, entry.getValue());
        }

        log.info("{} cause list for {}: {} case(s) looked up, item number saved on {}",
                courtLabel, hearingDate, cases.size(), saved);

        return saved;
    }
}
