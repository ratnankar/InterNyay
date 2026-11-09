package com.internyay.service;

import com.internyay.entity.Case;
import com.internyay.repository.CaseRepository;
import com.internyay.scraper.CauseListMatcher;
import com.internyay.scraper.DelhiHighCourtCauseListClient;
import com.internyay.scraper.DelhiHighCourtCauseListClient.CauseListDocument;
import com.internyay.scraper.CauseListFetch;
import com.internyay.scraper.CauseListUnavailableException;
import com.internyay.scraper.ItemNoFinder;
import com.internyay.scraper.SupremeCourtCauseListClient;
import com.internyay.scraper.SupremeCourtCauseListMatcher;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;
import java.util.stream.Collectors;

@Service
@Slf4j
public class CauseListService {

    private final CaseRepository caseRepo;
    private final CourtService courtService;
    private final DelhiHighCourtCauseListClient delhiHighCourt;
    private final boolean delhiHighCourtEnabled;
    private final Set<String> delhiHighCourtNames;
    private final SupremeCourtCauseListClient supremeCourt;
    private final boolean supremeCourtEnabled;
    private final Set<String> supremeCourtNames;
    private final Duration cacheTtl;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    private record Cached(long at, CauseListFetch fetch) {}

    public CauseListService(
            CaseRepository caseRepo,
            CourtService courtService,
            DelhiHighCourtCauseListClient delhiHighCourt,
            SupremeCourtCauseListClient supremeCourt,
            @Value("${causelist.delhihc.enabled:true}") boolean delhiHighCourtEnabled,
            @Value("${causelist.delhihc.court-name:Delhi High Court,High Court of Delhi}") String delhiHighCourtName,
            @Value("${causelist.sci.enabled:true}") boolean supremeCourtEnabled,
            @Value("${causelist.sci.court-name:Supreme Court of India,Supreme Court}") String supremeCourtName,
            @Value("${causelist.cache-minutes:5}") int cacheMinutes) {

        this.caseRepo = caseRepo;
        this.courtService = courtService;
        this.delhiHighCourt = delhiHighCourt;
        this.supremeCourt = supremeCourt;
        this.delhiHighCourtEnabled = delhiHighCourtEnabled;
        this.delhiHighCourtNames = courtNames(delhiHighCourtName);
        this.supremeCourtEnabled = supremeCourtEnabled;
        this.supremeCourtNames = courtNames(supremeCourtName);
        this.cacheTtl = Duration.ofMinutes(Math.max(0, cacheMinutes));
    }

    private static Set<String> courtNames(String configured) {
        if (configured == null) return Set.of();

        return Arrays.stream(configured.split(","))
                .map(CauseListMatcher::normalize)
                .filter(name -> !name.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    private CauseListFetch load(String courtLabel, LocalDate hearingDate, Supplier<CauseListFetch> download) {
        String key = courtLabel + "|" + hearingDate;
        long now = System.nanoTime();
        Cached hit = cache.get(key);

        if (hit != null && now - hit.at() < cacheTtl.toNanos()) return hit.fetch();

        CauseListFetch fetch = download.get();

        if (fetch.complete() && !fetch.documents().isEmpty()) {
            long stored = System.nanoTime();
            cache.put(key, new Cached(stored, fetch));
            cache.values().removeIf(c -> stored - c.at() > cacheTtl.toNanos());
        }
        return fetch;
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
                () -> load("Delhi High Court", hearingDate, () -> delhiHighCourt.fetch(hearingDate)), CauseListMatcher::new);

        saved += saveFromPdf("Supreme Court", hearingDate, supremeCourtCases,
                () -> load("Supreme Court", hearingDate, () -> supremeCourt.fetch(hearingDate)), SupremeCourtCauseListMatcher::new);

        return new Result(hearingDate, delhiHcCases.size() + supremeCourtCases.size(), saved);
    }

    // What a single-case lookup found: whether the court has published a list for the date, and the case's item number in it
    public record CaseLookup(boolean listPublished, Integer itemNo) {}

    // True when this case's cause list is read from a High Court / Supreme Court PDF (no CAPTCHA involved)
    public boolean readsFromPdf(Case c) {
        return isDelhiHighCourt(c) || isSupremeCourt(c);
    }

    public boolean hasSearchableCaseNo(Case c) {
        String caseNo = c.getCaseNo();

        if (caseNo == null || caseNo.isBlank()) return false;

        return isSupremeCourt(c)
                ? SupremeCourtCauseListMatcher.isSearchable(caseNo)
                : CauseListMatcher.isSearchable(caseNo);
    }

    // Looks one case up in the court's published PDF for the date. Only reads, saving is left to the caller
    public CaseLookup lookUpCase(Case c, LocalDate hearingDate) {
        CauseListFetch fetch;
        Function<List<String>, ? extends ItemNoFinder> matcherFor;

        if (isDelhiHighCourt(c)) {
            fetch = load("Delhi High Court", hearingDate, () -> delhiHighCourt.fetch(hearingDate));
            matcherFor = CauseListMatcher::new;
        } else if (isSupremeCourt(c)) {
            fetch = load("Supreme Court", hearingDate, () -> supremeCourt.fetch(hearingDate));
            matcherFor = SupremeCourtCauseListMatcher::new;
        } else {
            return new CaseLookup(false, null);
        }

        if (fetch.documents().isEmpty()) return new CaseLookup(false, null);

        for (CauseListDocument document : fetch.documents()) {
            Optional<Integer> itemNo = matcherFor.apply(document.lines()).findItemNo(c.getCaseNo());
            if (itemNo.isPresent()) return new CaseLookup(true, itemNo.get());
        }

        if (!fetch.complete()) {
            throw new CauseListUnavailableException("Some cause list PDFs could not be read for " + hearingDate);
        }
        return new CaseLookup(true, null);
    }

    private boolean isDelhiHighCourt(Case c) {
        return delhiHighCourtEnabled && isCourt(c, delhiHighCourtNames);
    }

    private boolean isSupremeCourt(Case c) {
        return supremeCourtEnabled && isCourt(c, supremeCourtNames);
    }

    private boolean isCourt(Case c, Set<String> courtNames) {
        return c.getCourtPlace() != null
                && c.getCourtPlace().isHighCourt()
                && c.getCourtPlace().getCourt() != null
                && courtNames.contains(CauseListMatcher.normalize(c.getCourtPlace().getCourt()));
    }

    private int saveFromPdf(String courtLabel, LocalDate hearingDate, List<Case> cases,
                            Supplier<CauseListFetch> download,
                            Function<List<String>, ? extends ItemNoFinder> matcherFor) {

        if (cases.isEmpty()) return 0;

        List<CauseListDocument> documents;

        try {
            documents = download.get().documents();
        } catch (CauseListUnavailableException e) {
            log.warn("{} cause list for {} skipped: {}", courtLabel, hearingDate, e.getMessage());
            return 0;
        }

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
