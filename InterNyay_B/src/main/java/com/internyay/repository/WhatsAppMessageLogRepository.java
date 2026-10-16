package com.internyay.repository;

import com.internyay.entity.WhatsAppMessageLog;
import com.internyay.entity.WhatsAppMessageLog.Kind;
import com.internyay.entity.WhatsAppMessageLog.Origin;
import com.internyay.entity.WhatsAppMessageLog.Status;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;

// Log of WhatsApp messages sent to clients
public interface WhatsAppMessageLogRepository extends JpaRepository<WhatsAppMessageLog, Long> {

    // Used to avoid sending the same reminder twice
    boolean existsByCaseIdAndClientIdAndKindAndOriginAndHearingDateAndStatusIn(
            Long caseId, Long clientId, Kind kind, Origin origin,
            LocalDate hearingDate, Collection<Status> statuses);

    // How many messages a user has sent after a time
    long countByUserIdAndOriginAndStatusAndCreatedAtAfter(
            Long userId, Origin origin, Status status, LocalDateTime after);

    // Removes the log of a user
    void deleteByUserId(Long userId);
}
