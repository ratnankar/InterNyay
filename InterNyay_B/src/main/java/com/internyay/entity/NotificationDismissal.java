package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

// Remembers that a user has dismissed an important notification
@Entity
@Table(name = "notification_dismissals",
       uniqueConstraints = @UniqueConstraint(name = "uk_notif_dismissal_user_notif",
                                             columnNames = {"user_id", "notification_id"}))
@Getter @Setter @NoArgsConstructor
public class NotificationDismissal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "notification_id", nullable = false)
    private Long notificationId;

    // When it was dismissed
    private LocalDateTime dismissedAt = LocalDateTime.now();

    // Shortcut to create a row
    public NotificationDismissal(Long userId, Long notificationId) {
        this.userId = userId;
        this.notificationId = notificationId;
    }
}
