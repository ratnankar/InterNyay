package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

// A to-do item of a user
@Entity
@Table(name = "tasks", indexes = {
        @Index(name = "idx_tasks_user_status", columnList = "user_id, status"),
        @Index(name = "idx_tasks_due_date", columnList = "due_date")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    private String description;
    // Pending, In Progress or Completed, see TaskStatuses
    private String status;
    private String category;
    // Date the task is due
    private LocalDate dueDate;

    // Owner of the task
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // Created, updated and completed times
    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    private LocalDateTime updatedAt;

    // Refreshes the updated time on every save
    @PreUpdate
    void onUpdate() { this.updatedAt = LocalDateTime.now(); }

    private LocalDateTime completedAt;
}
