package com.internyay.service;

import com.internyay.entity.Case;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.HearingRepository;
import com.internyay.service.CauseListService.CaseLookup;
import com.internyay.service.DistrictCauseListRelayService.CaseOutcome;
import com.internyay.service.DistrictCauseListRelayService.CaseRefresh;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.ConcurrentHashMap;

// Manual cause list refresh of one case, for the button on the dashboard's hearing card. The scheduled runs and the admin
// relay keep working on whole dates, this looks up only the one case's court room (or the High Court / Supreme Court PDF)
@Service
@RequiredArgsConstructor
@Slf4j
public class CaseCauseListRefreshService {

    // Pressing the button again within this time answers with the last result and does not ask the court's site again
    private static final Duration COOLDOWN = Duration.ofSeconds(30);

    public enum Status { UPDATED, UNCHANGED, NOT_LISTED, NOT_PUBLISHED, TRY_AGAIN, UNSUPPORTED, FAILED }

    // causeListNo is the case's number for the date after the refresh (null when it has none)
    public record Result(Long caseId, LocalDate date, Status status, Integer causeListNo, String message) {}

    private record Recent(long at, Result result) {}

    private final CaseRepository caseRepo;
    private final HearingRepository hearingRepo;
    private final CauseListService pdfLists;
    private final DistrictCauseListRelayService districtLists;
    private final ManualCaptchaDesk captchaDesk;

    private final Map<String, Recent> recent = new ConcurrentHashMap<>();

    // Answers with a Result, or with a ManualCaptchaDesk.Challenge when the CAPTCHA has to be typed (the typed CAPTCHA
    // finishes this same lookup)
    public Object refresh(Long caseId, Long userId, LocalDate date) {
        Case c = caseRepo.findById(caseId).orElseThrow(() -> new NoSuchElementException("Case not found"));

        if (!c.getUser().getId().equals(userId)) throw new SecurityException("Forbidden");

        String key = caseId + "|" + date;
        long now = System.nanoTime();
        Recent last = recent.get(key);

        if (last != null && now - last.at() < COOLDOWN.toNanos()) return last.result();

        Object answer = lookUp(c, date, userId);

        // A failed attempt can be repeated at once, only an answer from the court is held back for a moment
        if (answer instanceof Result result && result.status() != Status.TRY_AGAIN && result.status() != Status.FAILED) {
            remember(key, result);
        }
        return answer;
    }

    private void remember(String key, Result result) {
        long now = System.nanoTime();
        recent.put(key, new Recent(now, result));
        recent.values().removeIf(r -> now - r.at() > COOLDOWN.toNanos());
    }

    private Object lookUp(Case c, LocalDate date, Long userId) {
        Integer before = savedNumber(c, date);

        try {
            Integer found;

            if (pdfLists.readsFromPdf(c)) {
                CaseLookup lookup = pdfLists.lookUpCase(c, date);

                if (!lookup.listPublished()) {
                    return result(c, date, Status.NOT_PUBLISHED, before, "The court has not published the cause list for this date yet");
                }
                if (lookup.itemNo() == null) {
                    return result(c, date, Status.NOT_LISTED, before, "This case is not in the cause list for this date");
                }

                found = lookup.itemNo();
                save(c, date, found);

            } else {
                CaseRefresh r = districtLists.refreshOne(c, date);

                if (r.outcome() == CaseOutcome.NEEDS_CAPTCHA && r.ticket() != null) {
                    DistrictCauseListRelayService.Ticket ticket = r.ticket();
                    String key = c.getId() + "|" + date;
                    return captchaDesk.open(userId, ticket.session(), ticket.submit(), result -> {
                        Result done = fromDistrict(c, date, before, ticket.finish().apply(result));
                        if (done.status() != Status.TRY_AGAIN && done.status() != Status.FAILED) remember(key, done);
                        return done;
                    }, "");
                }

                return fromDistrict(c, date, before, r);
            }

            Status status = found.equals(before) ? Status.UNCHANGED : Status.UPDATED;
            return result(c, date, status, found, status == Status.UNCHANGED
                    ? "Cause list number is already up to date" : "Cause list number updated");

        } catch (RuntimeException e) {
            log.warn("Cause list refresh for case {} on {} failed: {}", c.getId(), date, e.getMessage());
            return result(c, date, Status.FAILED, before, "Could not read the cause list right now, try again in a while");
        }
    }

    // Same rule as the cases page: the case row holds the number of its next hearing date, a heard hearing keeps its own
    private void save(Case c, LocalDate date, Integer itemNo) {
        if (date.equals(c.getNextHearing())) caseRepo.saveCauseListNo(itemNo, date, List.of(c.getId()));
        hearingRepo.saveCauseListNo(itemNo, date, List.of(c.getId()));
    }

    private Integer savedNumber(Case c, LocalDate date) {
        return date.equals(c.getListingDate()) ? c.getCauseListNo() : null;
    }

    // A district court answer as the page sees it (a FOUND answer is only compared with the number the case already had)
    private Result fromDistrict(Case c, LocalDate date, Integer before, CaseRefresh r) {
        switch (r.outcome()) {
            case NEEDS_CAPTCHA:
                return result(c, date, Status.TRY_AGAIN, before, r.message());
            case UNSUPPORTED:
                return result(c, date, Status.UNSUPPORTED, before, r.message());
            case FAILED:
                return result(c, date, Status.FAILED, before, "Could not read the cause list: " + r.message());
            case NOT_LISTED:
                return result(c, date, Status.NOT_LISTED, before, r.message());
            default: {
                boolean same = r.serial().equals(before);
                return result(c, date, same ? Status.UNCHANGED : Status.UPDATED, r.serial(),
                        same ? "Cause list number is already up to date" : "Cause list number updated");
            }
        }
    }

    private Result result(Case c, LocalDate date, Status status, Integer number, String message) {
        return new Result(c.getId(), date, status, number, message);
    }
}
