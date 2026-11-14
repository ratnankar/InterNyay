package com.internyay.controller;

import com.internyay.dto.TaskCategoryDto;
import com.internyay.dto.TaskCategoryRequest;
import com.internyay.service.TaskCategoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/task-categories")
@RequiredArgsConstructor
public class TaskCategoryController {

    private final TaskCategoryService categoryService;
    private final AuthHelper auth;

    @GetMapping
    public ResponseEntity<List<TaskCategoryDto>> list() {
        return ResponseEntity.ok(categoryService.list(auth.currentUserId()));
    }

    @PostMapping
    public ResponseEntity<TaskCategoryDto> create(@Valid @RequestBody TaskCategoryRequest req) {
        return ResponseEntity.ok(categoryService.create(req.getName(), auth.currentUserId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        categoryService.delete(id, auth.currentUserId());
        return ResponseEntity.noContent().build();
    }
}
