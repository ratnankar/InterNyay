package com.internyay.dto;
import jakarta.validation.constraints.*;
import lombok.Data;
import java.time.LocalDate;
// Body to create or update a task
@Data
public class TaskRequest {
    @NotBlank public String title;
    public String description, status, category;
    public LocalDate dueDate;
}
