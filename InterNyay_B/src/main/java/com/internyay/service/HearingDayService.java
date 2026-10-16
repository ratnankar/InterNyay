package com.internyay.service;

import com.internyay.entity.NoHearingDate;
import com.internyay.repository.NoHearingDateRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

// Days on which no hearing can be scheduled: Sundays and days the advocate blocked
@Service
@RequiredArgsConstructor
public class HearingDayService {

    private static final DateTimeFormatter PRETTY =
            DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private final NoHearingDateRepository repo;

    // Sundays are always closed
    public static boolean isSunday(LocalDate date) {
        return date.getDayOfWeek() == DayOfWeek.SUNDAY;
    }

    // Throws when a hearing date falls on a closed day
    public void assertAllowed(LocalDate date, Long userId) {
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
