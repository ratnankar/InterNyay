package com.internyay.repository;

import com.internyay.entity.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

// Notifications published by the admin
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    // Count, latest id and latest update time, the frontend uses it to see if anything changed
    interface ChangeStamp {
        long getCnt();
        Long getMaxId();
        LocalDateTime getMaxUpdated();
    }

    // Reads the change stamp in one query
    @Query("select count(n) as cnt, max(n.id) as maxId, max(n.updatedAt) as maxUpdated from Notification n")
    ChangeStamp changeStamp();

    // All notifications, latest first
    List<Notification> findAllByOrderByDateDescIdDesc();

    // Notifications of one source, latest first
    List<Notification> findBySourceOrderByDateDescIdDesc(String source);

    // Important notifications from a date that this user has not dismissed
    @Query("select n from Notification n " +
           "where n.important = true and n.createdAt >= :since " +
           "and not exists (select 1 from NotificationDismissal d " +
           "                where d.notificationId = n.id and d.userId = :userId) " +
           "order by n.createdAt asc, n.id asc")
    List<Notification> findPendingImportant(@Param("userId") Long userId,
                                            @Param("since") LocalDateTime since);
}
