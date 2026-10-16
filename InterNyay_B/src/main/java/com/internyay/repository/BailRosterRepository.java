package com.internyay.repository;

import com.internyay.entity.BailRosterEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

// Bail roster entries shown in Quick Access
public interface BailRosterRepository extends JpaRepository<BailRosterEntry, Long> {

    // Entries of a court and district, null filters match everything
    @Query("""
        SELECT b FROM BailRosterEntry b
        WHERE (:court IS NULL OR b.court = :court)
        AND (:district IS NULL OR b.district = :district)
        ORDER BY b.court, b.district, b.id
        """)
    List<BailRosterEntry> findByFilters(String court, String district);
}
