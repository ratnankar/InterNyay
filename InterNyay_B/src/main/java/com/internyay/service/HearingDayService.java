package com.internyay.service;

import com.internyay.entity.Case;
import com.internyay.entity.Hearing;
import com.internyay.entity.HearingDayLimit;
import com.internyay.entity.NoHearingDate;
import com.internyay.dto.HearingLimitsDto;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.HearingDayLimitRepository;
import com.internyay.repository.HearingRepository;
import com.internyay.repository.NoHearingDateRepository;
import com.internyay.repository.UserRepository;
import com.internyay.util.CaseStatuses;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

// Days on which no hearing can be scheduled: Sundays, days the advocate blocked and days that already hold as many
// hearings as the advocate's daily limit allows
@Service
@RequiredArgsConstructor
public class HearingDayService {

    private static final DateTimeFormatter PRETTY =
            DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    // Highest daily limit that can be set
    public static final int MAX_DAILY_LIMIT = 200;

    private final NoHearingDateRepository repo;
    private final HearingDayLimitRepository limitRepo;
    private final CaseRepository caseRepo;
    private final HearingRepository hearingRepo;
    private final UserRepository userRepo;

    // Sundays are always closed
    public static boolean isSunday(LocalDate date) {
        return date.getDayOfWeek() == DayOfWeek.SUNDAY;
    }

    // Throws when a hearing date falls on a closed day or the day is already full
    public void assertAllowed(LocalDate date, Long userId) {
        assertAllowed(date, userId, null);
    }

    // Same check for a case that is being given the date: that case does not count towards the day's limit,
    // so saving a case on the date it already has never fails
    public void assertAllowed(LocalDate date, Long userId, Long caseId) {
        if (date == null) return;

        if (isSunday(date)) {
            throw new IllegalArgumentException(
                    "Hearings cannot be set on a Sunday (" + PRETTY.format(date) + ") — pick another date");
        }
        if (repo.existsByUserIdAndBlockedDate(userId, date)) {
            throw new IllegalArgumentException(
                    PRETTY.format(date) + " is marked as a no-hearing date — pick another date "
                  + "or remove the cross from the calendar first");
        }

        Integer limit = limitFor(date, userId);
        if (limit != null && countOn(date, userId, caseId) >= limit) {
            throw new IllegalArgumentException(
                    PRETTY.format(date) + " already has " + limit + " hearing" + (limit == 1 ? "" : "s")
                  + ", the daily limit — pick another date or raise the limit for this date from the calendar");
        }
    }

    // Limit that applies to a date: the one set for that date, else the usual limit, null when there is none
    public Integer limitFor(LocalDate date, Long userId) {
        return limitRepo.findByUserIdAndLimitDate(userId, date)
                .map(HearingDayLimit::getMaxHearings)
                .orElseGet(() -> userRepo.findById(userId).map(u -> u.getDailyHearingLimit()).orElse(null));
    }

    // Different cases with a hearing on the date (next hearing date or hearing history, withdrawn ones are ignored),
    // the same count the calendar shows. A given case is left out
    public int countOn(LocalDate date, Long userId, Long excludeCaseId) {
        Set<Long> caseIds = new HashSet<>();

        for (Case c : caseRepo.findByUser_IdAndNextHearing(userId, date)) caseIds.add(c.getId());
        for (Hearing h : hearingRepo.findWithCaseByUserAndDate(userId, date)) {
            if (CaseStatuses.WITHDRAWN_OUTCOME.equalsIgnoreCase(h.getOutcome() == null ? "" : h.getOutcome().trim())) continue;
            caseIds.add(h.getLegalCase().getId());
        }

        if (excludeCaseId != null) caseIds.remove(excludeCaseId);
        return caseIds.size();
    }

    // The usual limit and the limits of particular dates
    @Transactional(readOnly = true)
    public HearingLimitsDto limits(Long userId) {
        Map<LocalDate, Integer> overrides = new LinkedHashMap<>();
        limitRepo.findByUserIdOrderByLimitDateAsc(userId)
                .forEach(l -> overrides.put(l.getLimitDate(), l.getMaxHearings()));

        Integer usual = userRepo.findById(userId).map(u -> u.getDailyHearingLimit()).orElse(null);
        return new HearingLimitsDto(usual, overrides);
    }

    // Change the usual limit, null removes it. 0 is not allowed here: it would close every day
    @Transactional
    public void setDefaultLimit(Integer limit, Long userId) {
        if (limit != null && limit == 0) {
            throw new IllegalArgumentException(
                    "The usual daily limit cannot be 0 — set 0 on a single date to make it a no-hearing date");
        }
        validateLimit(limit);
        userRepo.findById(userId).ifPresent(u -> {
            u.setDailyHearingLimit(limit);
            userRepo.save(u);
        });
    }

    // Set the limit of one date. 0 makes it a no-hearing date, a number from 1 up is a limit (and lifts a no-hearing mark),
    // null removes the limit so the usual one applies. Hearings already listed are not moved
    @Transactional
    public void setDateLimit(LocalDate date, Integer limit, Long userId) {
        if (date == null) throw new IllegalArgumentException("Date is required");
        if (limit == null) {
            resetDateLimit(date, userId);
            return;
        }
        validateLimit(limit);

        if (limit == 0) {
            mark(date, userId);
            return;
        }

        repo.deleteByUserIdAndBlockedDate(userId, date);
        HearingDayLimit row = limitRepo.findByUserIdAndLimitDate(userId, date)
                .orElseGet(() -> new HearingDayLimit(userId, date, limit));
        row.setMaxHearings(limit);
        limitRepo.save(row);
    }

    // Remove the limit of one date: the usual limit applies again and a no-hearing mark (limit 0) is lifted
    @Transactional
    public void resetDateLimit(LocalDate date, Long userId) {
        limitRepo.deleteByUserIdAndLimitDate(userId, date);
        repo.deleteByUserIdAndBlockedDate(userId, date);
    }

    // A limit is a whole number from 0 (a no-hearing date) up to the highest allowed
    private void validateLimit(Integer limit) {
        if (limit == null) return;
        if (limit < 0 || limit > MAX_DAILY_LIMIT) {
            throw new IllegalArgumentException(
                    "The daily hearing limit must be between 0 and " + MAX_DAILY_LIMIT);
        }
    }

    // Dates the advocate has blocked
    public List<LocalDate> list(Long userId) {
        return repo.findByUserIdOrderByBlockedDateAsc(userId).stream()
                .map(NoHearingDate::getBlockedDate)
                .toList();
    }

    // Block a date, Sundays are already closed
    @Transactional
    public LocalDate mark(LocalDate date, Long userId) {
        if (date == null) throw new IllegalArgumentException("Date is required");
        if (isSunday(date)) {
            throw new IllegalArgumentException("Sundays are already closed for hearings");
        }
        // A no-hearing date is a date with a limit of 0, so a limit set earlier for it is dropped
        limitRepo.deleteByUserIdAndLimitDate(userId, date);
        if (!repo.existsByUserIdAndBlockedDate(userId, date)) {
            repo.save(new NoHearingDate(userId, date));
        }
        return date;
    }

    // Unblock a date
    @Transactional
    public void unmark(LocalDate date, Long userId) {
        repo.deleteByUserIdAndBlockedDate(userId, date);
    }
}
