package com.internyay.service;

import com.internyay.scraper.CaptchaSolverClient;
import com.internyay.scraper.DistrictPortalClient;
import com.internyay.scraper.DistrictPortalClient.PortalSession;
import com.internyay.scraper.DistrictPortalClient.SubmitResult;
import com.internyay.scraper.PortalCaseParser;
import com.internyay.scraper.PortalCaseParser.OrderRow;
import com.internyay.scraper.PortalCaseParser.ParsedCase;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

// Reads the case page of the eCourts Services portal (case status by CNR) to find out whether an order exists
// for one hearing date. It uses the same portal client, CAPTCHA reader and page parser as the Add Case lookup
// (CnrLookupService), so nothing here talks to the paid eCourts API.
//
// There is nobody to type a CAPTCHA when this runs in the background, so it needs the automatic CAPTCHA reader
// (captcha.solver.*). Without it, or when the portal is down, the answer is simply "nothing found".
@Slf4j
@Service
public class ScrapingService {

    // Tries to get a usable portal session before giving up
    private static final int SESSION_TRIES = 3;

    private final DistrictPortalClient portal;
    private final CaptchaSolverClient solver;
    private final List<String> pages;
    private final String searchPath;
    private final String stateCode;
    private final String displayPdfPath;

    public ScrapingService(
            DistrictPortalClient portal,
            CaptchaSolverClient solver,
            @Value("${cnr.portal.page:casestatus/index,cnr_status/index}") String pages,
            @Value("${cnr.portal.path.search:cnr_status/searchByCNR/}") String searchPath,
            @Value("${causelist.district.state-code:26}") String stateCode,
            @Value("${cnr.portal.path.display-pdf:home/display_pdf}") String displayPdfPath) {
        this.portal = portal;
        this.solver = solver;
        this.pages = Arrays.stream(pages.split(",")).map(String::trim).filter(v -> !v.isEmpty()).toList();
        this.searchPath = searchPath;
        this.stateCode = stateCode;
        this.displayPdfPath = displayPdfPath;
    }

    // Whether the automatic CAPTCHA reader can be used right now (background lookups need it)
    public boolean available() {
        return solver.available();
    }

    // An order PDF downloaded from the portal, with the file name eCourts gives it (order-3.pdf)
    public record FetchedOrder(String fileName, byte[] pdf) {}

    // Downloads the order of one hearing date. Empty when eCourts lists no downloadable order for the date, or when the
    // portal could not be read (never throws); the caller then tells the advocate to try again
    public Optional<FetchedOrder> fetchOrderForDate(String rawCnr, LocalDate hearingDate) {
        String cnr = EcourtsCaseService.normalizeCnr(rawCnr);
        if (cnr == null || hearingDate == null) return Optional.empty();

        if (!solver.available()) {
            log.info("CNR {}: order for {} not fetched, the automatic CAPTCHA reader is not available", cnr, hearingDate);
            return Optional.empty();
        }

        try {
            Read read = readCaseWithSession(cnr);
            if (read == null) return Optional.empty();

            OrderRow row = read.parsed().orders().stream()
                    .filter(o -> hearingDate.equals(o.date()) && o.link() != null)
                    .findFirst()
                    .orElse(null);
            if (row == null) return Optional.empty();

            byte[] pdf = read.session() == null ? null : portal.orderPdf(read.session(), displayPdfPath, row.link());
            if (pdf == null) {
                // The portal sometimes answers an order request with a page instead of the file: ask once more
                try { Thread.sleep(1500); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); return Optional.empty(); }
                pdf = portal.orderPdf(read.session(), displayPdfPath, row.link());
            }
            if (pdf == null || pdf.length == 0) return Optional.empty();

            log.info("CNR {}: order {} for {} downloaded ({} bytes)", cnr, row.fileName(), hearingDate, pdf.length);
            return Optional.of(new FetchedOrder(row.fileName(), pdf));
        } catch (IOException | RuntimeException e) {
            log.warn("CNR {}: eCourts order download for {} failed: {}", cnr, hearingDate, e.getMessage());
            return Optional.empty();
        }
    }

    // What the portal's case page says about where the case goes next
    //  nextHearing - the "Next Hearing Date" of the page, null when it shows none
    //  disposed    - the page says the case is disposed
    //  history     - every past hearing date and order file on the page (null when not read)
    public record CaseOutlook(boolean disposed, LocalDate nextHearing, EcourtsCaseService.Snapshot history) {
        public CaseOutlook(boolean disposed, LocalDate nextHearing) { this(disposed, nextHearing, null); }
    }

    // The next hearing date eCourts shows for the case. Empty when it could not be read: no automatic CAPTCHA reader,
    // the portal is down, or the page was not this case (never throws), so the caller simply tries again later
    public Optional<CaseOutlook> lookUpOutlook(String rawCnr) {
        String cnr = EcourtsCaseService.normalizeCnr(rawCnr);
        if (cnr == null) return Optional.empty();

        if (!solver.available()) {
            log.info("CNR {}: next hearing date not looked up, the automatic CAPTCHA reader is not available", cnr);
            return Optional.empty();
        }

        try {
            Read read = readCaseWithSession(cnr);
            if (read == null) return Optional.empty();
            ParsedCase parsed = read.parsed();

            log.info("CNR {}: eCourts shows next hearing {}{}", cnr,
                    parsed.nextHearing() == null ? "none" : parsed.nextHearing(),
                    parsed.disposed() ? " (disposed)" : "");

            return Optional.of(new CaseOutlook(parsed.disposed(), parsed.nextHearing(),
                    EcourtsCaseService.snapshotOf(parsed)));
        } catch (IOException | RuntimeException e) {
            log.warn("CNR {}: eCourts next hearing date lookup failed: {}", cnr, e.getMessage());
            return Optional.empty();
        }
    }

    // The parsed case page together with the portal session it was read on (an order download needs that session)
    private record Read(PortalSession session, ParsedCase parsed) {}

    // Opens a portal session, reads the CAPTCHA automatically and returns the parsed case page with its session, or null
    private Read readCaseWithSession(String cnr) throws IOException {
        PortalSession session = openUsableSession(cnr);

        for (int attempt = 1; attempt <= solver.maxAttempts(); attempt++) {
            byte[] image = portal.captcha(session);

            var text = solver.solve(image);
            if (text.isEmpty()) {
                if (!solver.available()) break;
                continue;
            }

            SubmitResult result = portal.searchCnr(session, searchPath, cnr, text.get());
            if (result.html() != null) {
                ParsedCase parsed = PortalCaseParser.parse(result.html());
                if (!parsed.found() || !cnr.equalsIgnoreCase(parsed.cnr())) {
                    log.warn("CNR {}: the portal's case page could not be read or was another case", cnr);
                    return null;
                }
                return new Read(session, parsed);
            }
            if (!result.captchaRejected()) {
                log.info("CNR {}: portal has no case page ({})", cnr, result.message());
                return null;
            }
            // CAPTCHA refused: a new picture is fetched on the next round
        }

        log.info("CNR {}: the CAPTCHA could not be read automatically, order not looked up", cnr);
        return null;
    }

    // A session whose warm-up gives no districts is one the portal refuses every CAPTCHA on, so another is opened
    private PortalSession openUsableSession(String cnr) throws IOException {
        IOException last = null;
        for (int attempt = 1; attempt <= SESSION_TRIES; attempt++) {
            for (String page : pages) {
                try {
                    PortalSession session = portal.open(page);
                    if (portal.warmUp(session, stateCode)) return session;
                } catch (IOException e) {
                    last = e;
                }
            }
        }
        throw last != null ? last : new IOException("the portal only gave unusable sessions for CNR " + cnr);
    }
}