package com.internyay.repository;

import com.internyay.entity.ChatFeedback;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ChatFeedbackRepository extends JpaRepository<ChatFeedback, Long> {

    Optional<ChatFeedback> findByMessageIdAndAccountId(Long messageId, Long accountId);

    List<ChatFeedback> findByAccountIdAndMessageIdIn(Long accountId, Collection<Long> messageIds);

    // Votes of one kind given since a date, so the admin figures follow the chosen period
    long countByRatingAndUpdatedAtGreaterThanEqual(int rating, LocalDateTime since);

    @Query("""
        SELECT f.rating, f.note, f.updatedAt, a.content, q.content
        FROM ChatFeedback f, ChatMessage a, ChatMessage q
        WHERE a.id = f.messageId AND f.rating < 0 AND f.updatedAt >= :since
        AND q.id = (SELECT MAX(p.id) FROM ChatMessage p WHERE p.conversationId = a.conversationId AND p.id < a.id AND p.role = 'user')
        ORDER BY f.updatedAt DESC
        """)
    List<Object[]> recentDownvotes(LocalDateTime since, Pageable pageable);
}
