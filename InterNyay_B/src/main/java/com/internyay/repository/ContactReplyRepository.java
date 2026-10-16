package com.internyay.repository;

import com.internyay.entity.ContactReply;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

// Admin replies to contact messages
public interface ContactReplyRepository extends JpaRepository<ContactReply, Long> {

    // Replies of many messages in one go, oldest first
    List<ContactReply> findByMessageIdInOrderByCreatedAtAsc(Collection<Long> messageIds);

    // Removes the replies when a message is deleted
    void deleteByMessageId(Long messageId);
}
