package com.internyay.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class TaskCategoryRequest {
    @NotBlank @Size(max = 100) public String name;
}
