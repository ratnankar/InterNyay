package com.internyay.dto;
import com.internyay.entity.Task;
import com.internyay.util.TaskStatuses;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
// Task as sent to the frontend
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class TaskDto {
    public Long id;
    public String title, description, status, category;
    public LocalDate dueDate;
    public LocalDateTime createdAt, completedAt;
    // Builds the DTO from the entity
    public static TaskDto from(Task t) {
        return TaskDto.builder().id(t.getId()).title(t.getTitle()).description(t.getDescription())
            .status(TaskStatuses.normalize(t.getStatus())).category(t.getCategory())
            .dueDate(t.getDueDate()).createdAt(t.getCreatedAt()).completedAt(t.getCompletedAt()).build();
    }
}
