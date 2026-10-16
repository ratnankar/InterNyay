package com.internyay.repository;

import com.internyay.entity.NoHearingDate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

// Dates a user has marked as having no hearing
public interface NoHearingDateRepository extends JpaRepository<NoHearingDate, Long> {

    // Blocked dates of a user
    List<NoHearingDate> findByUserIdOrderByBlockedDateAsc(Long userId);

    // Checks if a date is already blocked
    boolean existsByUserIdAndBlockedDate(Long userId, LocalDate blockedDate);

    // Unblocks a date
    void deleteByUserIdAndBlockedDate(Long userId, LocalDate blockedDate);

    // Removes all blocked dates of a user
    void deleteByUserId(Long userId);
}
