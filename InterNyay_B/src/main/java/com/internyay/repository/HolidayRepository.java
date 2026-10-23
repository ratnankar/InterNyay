package com.internyay.repository;

import com.internyay.entity.Holiday;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Court holidays added by the admin
public interface HolidayRepository extends JpaRepository<Holiday, Long> {

    // All holidays by date
    List<Holiday> findAllByOrderByDateAsc();

    // Holiday on a date, if any
    java.util.Optional<Holiday> findByDate(java.time.LocalDate date);

    // Used to block two holidays on the same date
    boolean existsByDate(java.time.LocalDate date);
}
