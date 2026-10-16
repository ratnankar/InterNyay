package com.internyay.controller;

import com.internyay.dto.*;
import com.internyay.service.TaskService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// To-do list of the logged in user
@RestController
@RequestMapping("/api/tasks")
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;
    private final AuthHelper auth;

    // Paged tasks
    @GetMapping
    public ResponseEntity<Page<TaskDto>> list(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(taskService.list(auth.currentUserId(), status, page, size));
    }

    // Add a task
    @PostMapping
    public ResponseEntity<TaskDto> create(@Valid @RequestBody TaskRequest req) {
        return ResponseEntity.ok(taskService.create(req, auth.currentUserId()));
    }

    // Edit or complete a task
    @PutMapping("/{id}")
    public ResponseEntity<TaskDto> update(@PathVariable Long id, @RequestBody TaskRequest req) {
        return ResponseEntity.ok(taskService.update(id, req, auth.currentUserId()));
    }

    // Delete a task
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        taskService.delete(id, auth.currentUserId());
        return ResponseEntity.noContent().build();
    }
}
