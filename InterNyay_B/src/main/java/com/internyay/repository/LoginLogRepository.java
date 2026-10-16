package com.internyay.repository;

import com.internyay.entity.LoginLog;
import com.internyay.entity.LoginLog.EventType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

// Sign-in log
public interface LoginLogRepository extends JpaRepository<LoginLog, Long>, JpaSpecificationExecutor<LoginLog> {

    // Counts for the summary at the top of the page
    long countByEventTypeAndCreatedAtAfter(EventType eventType, LocalDateTime after);

    // Retention: removes everything older than the cut off, returns how many rows went
    @Modifying
    @Transactional
    @Query("delete from LoginLog l where l.createdAt < :before")
    int deleteOlderThan(@Param("before") LocalDateTime before);
}
