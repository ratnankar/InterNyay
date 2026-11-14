package com.internyay.service;

import com.internyay.dto.TaskCategoryDto;
import com.internyay.entity.TaskCategory;
import com.internyay.entity.Task;
import com.internyay.repository.TaskCategoryRepository;
import com.internyay.repository.TaskRepository;
import com.internyay.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class TaskCategoryService {

    public static final String DEFAULT_CATEGORY = "General";

    private final TaskCategoryRepository categoryRepo;
    private final TaskRepository taskRepo;
    private final UserRepository userRepo;

    public List<TaskCategoryDto> list(Long userId) {
        return categoryRepo.findByUser_IdOrderByNameAsc(userId).stream().map(TaskCategoryDto::from).toList();
    }

    @Transactional
    public TaskCategoryDto create(String rawName, Long userId) {
        String name = rawName == null ? "" : rawName.trim().replaceAll("\\s+", " ");
        if (name.isEmpty()) throw new IllegalArgumentException("Category name is required");
        if (name.length() > 100) throw new IllegalArgumentException("Category name is too long");
        if (DEFAULT_CATEGORY.equalsIgnoreCase(name)) throw new IllegalArgumentException("General is always available");
        TaskCategory category = categoryRepo.findByUser_IdAndNameIgnoreCase(userId, name)
                .orElseGet(() -> categoryRepo.save(TaskCategory.builder()
                        .name(name)
                        .user(userRepo.getReferenceById(userId))
                        .build()));
        return TaskCategoryDto.from(category);
    }

    @Transactional
    public void delete(Long id, Long userId) {
        TaskCategory category = categoryRepo.findById(id).orElseThrow(() -> new RuntimeException("Category not found"));
        if (!category.getUser().getId().equals(userId)) throw new RuntimeException("Forbidden");
        List<Task> tasks = taskRepo.findByUser_Id(userId).stream()
                .filter(t -> t.getCategory() != null && t.getCategory().trim().equalsIgnoreCase(category.getName()))
                .toList();
        tasks.forEach(t -> t.setCategory(null));
        taskRepo.saveAll(tasks);
        categoryRepo.delete(category);
    }
}
