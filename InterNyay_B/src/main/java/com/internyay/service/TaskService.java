package com.internyay.service;

import com.internyay.dto.*;
import com.internyay.entity.*;
import com.internyay.repository.*;
import com.internyay.util.TaskStatuses;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

// To-do list tasks of a user
@Service
@RequiredArgsConstructor
public class TaskService {

    private final TaskRepository taskRepo;
    private final UserRepository userRepo;

    // Newest first, optional status filter
    public Page<TaskDto> list(Long userId, String status, int page, int size) {
        Pageable p = PageRequest.of(page, size, Sort.by("createdAt").descending());
        return taskRepo.findByFilters(userId, blank(status), p).map(TaskDto::from);
    }

    // Add a task
    public TaskDto create(TaskRequest req, Long userId) {
        Task t = Task.builder()
                .title(req.getTitle()).description(req.getDescription())
                .status(TaskStatuses.normalize(req.getStatus())).category(req.getCategory())
                .dueDate(req.getDueDate())
                .user(userRepo.getReferenceById(userId))
                .build();
        return TaskDto.from(taskRepo.save(t));
    }

    // Only fields that were sent are changed
    public TaskDto update(Long id, TaskRequest req, Long userId) {
        Task t = findOwned(id, userId);
        if (req.getTitle()       != null) t.setTitle(req.getTitle());
        if (req.getDescription() != null) t.setDescription(req.getDescription());
        if (req.getCategory()    != null) t.setCategory(req.getCategory());
        if (req.getDueDate()     != null) t.setDueDate(req.getDueDate());
        if (req.getStatus()      != null) {
            t.setStatus(TaskStatuses.normalize(req.getStatus()));
            t.setCompletedAt(TaskStatuses.COMPLETED.equals(t.getStatus()) ? LocalDateTime.now() : null);
        }
        return TaskDto.from(taskRepo.save(t));
    }

    // Delete a task
    public void delete(Long id, Long userId) {
        taskRepo.delete(findOwned(id, userId));
    }

    // Loads a task; throws "Task not found" if it doesn't exist and "Forbidden" if it belongs to another user
    private Task findOwned(Long id, Long userId) {
        Task t = taskRepo.findById(id).orElseThrow(() -> new RuntimeException("Task not found"));
        if (!t.getUser().getId().equals(userId)) throw new RuntimeException("Forbidden");
        return t;
    }

    private String blank(String s) { return (s == null || s.isBlank()) ? null : s; }
}
