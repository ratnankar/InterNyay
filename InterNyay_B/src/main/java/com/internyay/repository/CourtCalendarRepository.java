package com.internyay.repository;

import com.internyay.entity.CourtCalendar;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

// Court calendar uploaded per year
public interface CourtCalendarRepository extends JpaRepository<CourtCalendar, Long> {

    // Calendar of one year
    Optional<CourtCalendar> findByYear(Integer year);

    // All calendars, newest year first
    List<CourtCalendar> findAllByOrderByYearDesc();
}
