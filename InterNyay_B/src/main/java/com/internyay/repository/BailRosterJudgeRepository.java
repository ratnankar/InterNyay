package com.internyay.repository;

import com.internyay.entity.BailRosterJudge;
import org.springframework.data.jpa.repository.JpaRepository;

// Judges linked to bail roster entries
public interface BailRosterJudgeRepository extends JpaRepository<BailRosterJudge, Long> {

    // Remove all links of one roster entry
    void deleteByRosterId(Long rosterId);
}
