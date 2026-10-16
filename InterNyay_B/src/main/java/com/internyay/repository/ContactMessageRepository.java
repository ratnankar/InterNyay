package com.internyay.repository;

import com.internyay.entity.ContactMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

// Messages sent from the contact form and the help section
public interface ContactMessageRepository extends JpaRepository<ContactMessage, Long> {

    // Messages of one user, latest first
    List<ContactMessage> findByAccountIdOrderByCreatedAtDesc(Long accountId);

    // All messages for the admin, latest first
    List<ContactMessage> findAllByOrderByCreatedAtDesc();

    // Admin list filtered by status
    List<ContactMessage> findByStatusOrderByCreatedAtDesc(String status);

    // Messages with an admin reply the user has not read
    long countByAccountIdAndUserUnreadTrue(Long accountId);

    // Messages from a visitor who is not logged in, for the hourly limit
    long countByAccountIdIsNullAndEmailAndCreatedAtAfter(String email, LocalDateTime since);

    // Messages from a logged in user, for the hourly limit
    long countByAccountIdAndCreatedAtAfter(Long accountId, LocalDateTime since);
}
