package com.internyay.dto;

import com.internyay.entity.LegalForm;
import lombok.*;

import java.time.LocalDateTime;

// Legal form details sent to the frontend, the file is downloaded separately
@Getter @Builder
public class LegalFormDto {

    private Long id;
    private String name;
    private String description;
    // JSON with the positions of the fillable fields
    private String fieldConfig;
    private boolean fillable;
    private int fieldCount;
    private int sortOrder;
    private String fileName;
    private long sizeBytes;
    private LocalDateTime uploadedAt;
    private LocalDateTime updatedAt;

    // Builds the DTO from the entity
    public static LegalFormDto from(LegalForm f) {
        return LegalFormDto.builder()
                .id(f.getId())
                .name(f.getName())
                .description(f.getDescription())
                .fieldConfig(f.getFieldConfig())
                .fillable(Boolean.TRUE.equals(f.getFillable()))
                .fieldCount(f.getFieldCount() == null ? 0 : f.getFieldCount())
                .sortOrder(f.getSortOrder() == null ? 0 : f.getSortOrder())
                .fileName(f.getFileName())
                .sizeBytes(f.getSizeBytes())
                .uploadedAt(f.getUploadedAt())
                .updatedAt(f.getUpdatedAt())
                .build();
    }
}
