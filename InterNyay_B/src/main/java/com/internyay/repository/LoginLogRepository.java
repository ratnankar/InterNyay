package com.internyay.repository;

import com.internyay.entity.LoginLog;
import com.internyay.entity.LoginLog.EventType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.time.LocalDateTime;

// Sign-in log
public interface LoginLogRepository extends JpaRepository<LoginLog, Long>, JpaSpecificationExecutor<LoginLog> {

    // Counts for the summary at the top of the page
    long countByEventTypeAndCreatedAtAfter(EventType eventType, LocalDateTime after);
}
