package com.internyay.repository;

import com.internyay.entity.HearingDayLimit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

// Limits a user set for particular dates
public interface HearingDayLimitRepository extends JpaRepository<HearingDayLimit, Long> {

    // Limits of a user, by date
    List<HearingDayLimit> findByUserIdOrderByLimitDateAsc(Long userId);

    // Limit of one date
    Optional<HearingDayLimit> findByUserIdAndLimitDate(Long userId, LocalDate limitDate);

    // Removes the limit of one date, the usual limit applies again
    void deleteByUserIdAndLimitDate(Long userId, LocalDate limitDate);

    // Removes all limits of a user
    void deleteByUserId(Long userId);
}
