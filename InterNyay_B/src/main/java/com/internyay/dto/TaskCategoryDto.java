package com.internyay.dto;

import com.internyay.entity.TaskCategory;
import lombok.*;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class TaskCategoryDto {
    public Long id;
    public String name;

    public static TaskCategoryDto from(TaskCategory c) {
        return TaskCategoryDto.builder().id(c.getId()).name(c.getName()).build();
    }
}
