package com.internyay.repository;

import com.internyay.entity.CauseListRunLog;
import com.internyay.entity.CauseListRunLog.Status;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

// Log of cause list runs shown in Admin > Cause List
public interface CauseListRunLogRepository extends JpaRepository<CauseListRunLog, Long> {

    List<CauseListRunLog> findAllByOrderByStartedAtDesc(Pageable page);

    // The latest run that is not still running, used for the scheduler card
    Optional<CauseListRunLog> findFirstByStatusNotOrderByStartedAtDesc(Status status);

    List<CauseListRunLog> findByStatusAndStartedAtBefore(Status status, LocalDateTime before);

    long deleteByStartedAtBefore(LocalDateTime before);
}
