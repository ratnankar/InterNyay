package com.internyay.repository;

import com.internyay.entity.AppNote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

// Notes of the Calendar app
public interface AppNoteRepository extends JpaRepository<AppNote, Long> {

    long countByAccountId(Long accountId);

    Optional<AppNote> findByAccountIdAndClientId(Long accountId, String clientId);

    // Notes (and deletions) changed after the given time, oldest change first
    List<AppNote> findByAccountIdAndUpdatedAtGreaterThanOrderByUpdatedAtAsc(Long accountId, long since);
}
