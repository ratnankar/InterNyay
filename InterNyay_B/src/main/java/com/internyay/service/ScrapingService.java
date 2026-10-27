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

    public ScrapingService(
            DistrictPortalClient portal,
            CaptchaSolverClient solver,
            @Value("${cnr.portal.page:casestatus/index,cnr_status/index}") String pages,
            @Value("${cnr.portal.path.search:cnr_status/searchByCNR/}") String searchPath,
            @Value("${causelist.district.state-code:26}") String stateCode) {
        this.portal = portal;
        this.solver = solver;
        this.pages = Arrays.stream(pages.split(",")).map(String::trim).filter(v -> !v.isEmpty()).toList();
        this.searchPath = searchPath;
        this.stateCode = stateCode;
    }

    // The order of that hearing date as eCourts names its file (order-3.pdf, judgment-5.pdf). Empty when eCourts
    // lists no order for the date, or when the portal could not be read (never throws)
    public Optional<String> findOrderForDate(String rawCnr, LocalDate hearingDate) {
        String cnr = EcourtsCaseService.normalizeCnr(rawCnr);
        if (cnr == null || hearingDate == null) return Optional.empty();

        if (!solver.available()) {
            log.info("CNR {}: order for {} not looked up, the automatic CAPTCHA reader is not available", cnr, hearingDate);
            return Optional.empty();
        }

        try {
            ParsedCase parsed = readCase(cnr);
            if (parsed == null) return Optional.empty();

            // Interim orders come before the final judgment on the page; the first order of a date wins,
            // as it does when the orders are read while a case is added
            Optional<String> file = parsed.orders().stream()
                    .filter(o -> hearingDate.equals(o.date()))
                    .findFirst()
                    .map(OrderRow::fileName);

            log.info("CNR {}: {} for {}", cnr, file.map(f -> "order " + f).orElse("no order"), hearingDate);
            return file;
        } catch (IOException | RuntimeException e) {
            log.warn("CNR {}: eCourts order lookup for {} failed: {}", cnr, hearingDate, e.getMessage());
            return Optional.empty();
        }
    }

    // Opens a portal session, reads the CAPTCHA automatically and returns the parsed case page, or null
    private ParsedCase readCase(String cnr) throws IOException {
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
                return parsed;
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
