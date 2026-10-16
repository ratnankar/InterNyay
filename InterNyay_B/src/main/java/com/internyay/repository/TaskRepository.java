package com.internyay.repository;

import com.internyay.entity.Task;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

// To-do tasks of a user
public interface TaskRepository extends JpaRepository<Task, Long> {

    // Removes every task of a user
    void deleteByUser_Id(Long userId);

    // All tasks of one user
    List<Task> findByUser_Id(Long userId);

    // Task list with an optional status filter
    @Query("""
        SELECT t FROM Task t
        WHERE t.user.id = :userId
        AND (:status IS NULL OR t.status = :status)
        """)
    Page<Task> findByFilters(Long userId, String status, Pageable pageable);
}
