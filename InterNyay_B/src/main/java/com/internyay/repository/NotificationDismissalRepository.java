package com.internyay.repository;

import com.internyay.entity.NotificationDismissal;
import org.springframework.data.jpa.repository.JpaRepository;

// Which user has dismissed which important notification
public interface NotificationDismissalRepository extends JpaRepository<NotificationDismissal, Long> {

    // Has this user already dismissed it
    boolean existsByUserIdAndNotificationId(Long userId, Long notificationId);

    // Removes the dismissals when a notification is deleted
    void deleteByNotificationId(Long notificationId);
}
