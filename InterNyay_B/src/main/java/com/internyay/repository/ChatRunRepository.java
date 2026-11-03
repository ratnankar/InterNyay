package com.internyay.repository;

import com.internyay.entity.ChatRun;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;

public interface ChatRunRepository extends JpaRepository<ChatRun, Long> {

    @Query("SELECT r.outcome, COUNT(r) FROM ChatRun r WHERE r.createdAt >= :since GROUP BY r.outcome")
    List<Object[]> countByOutcome(LocalDateTime since);

    @Query("SELECT COUNT(r), COALESCE(AVG(r.latencyMs), 0.0), COALESCE(SUM(r.promptTokens), 0L), COALESCE(SUM(r.completionTokens), 0L), COALESCE(AVG(r.rounds), 0.0) FROM ChatRun r WHERE r.createdAt >= :since")
    List<Object[]> totals(LocalDateTime since);

    @Query("SELECT r.tools FROM ChatRun r WHERE r.createdAt >= :since AND r.tools IS NOT NULL")
    List<String> toolLists(LocalDateTime since);

    @Query("SELECT r FROM ChatRun r WHERE r.createdAt >= :since AND r.outcome <> 'OK' ORDER BY r.createdAt DESC")
    List<ChatRun> failures(LocalDateTime since, Pageable pageable);

    @Query("SELECT r FROM ChatRun r WHERE r.createdAt >= :since AND (r.tools IS NULL OR r.tools = '') AND r.outcome = 'OK' ORDER BY r.createdAt DESC")
    List<ChatRun> withoutTools(LocalDateTime since, Pageable pageable);
}
