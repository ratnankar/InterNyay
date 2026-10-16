package com.internyay.repository;

import com.internyay.entity.DutyMagistrate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

// Duty magistrate list shown in Quick Access
public interface DutyMagistrateRepository extends JpaRepository<DutyMagistrate, Long> {

    // Entries of a court and district, null filters match everything
    @Query("""
        SELECT d FROM DutyMagistrate d
        WHERE (:court IS NULL OR d.court = :court)
        AND (:district IS NULL OR d.district = :district)
        ORDER BY d.court, d.district, d.id
        """)
    List<DutyMagistrate> findByFilters(String court, String district);

    // Entries that use a judge, checked before the judge is deleted
    List<DutyMagistrate> findByJudgeId(Long judgeId);
}
