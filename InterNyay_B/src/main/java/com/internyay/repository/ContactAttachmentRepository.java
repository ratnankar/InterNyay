package com.internyay.repository;

import com.internyay.entity.ContactAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

// Files attached to contact messages
public interface ContactAttachmentRepository extends JpaRepository<ContactAttachment, Long> {

    // Attachments of several messages, loaded in one query
    List<ContactAttachment> findByMessageIdInOrderByIdAsc(Collection<Long> messageIds);

    // Attachments of one message
    List<ContactAttachment> findByMessageId(Long messageId);
}
