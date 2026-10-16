package com.internyay.dto;

import com.internyay.entity.DistrictPdf;
import lombok.*;

import java.time.LocalDateTime;

// District PDF details shown in the admin screen
@Getter @Builder
public class DistrictPdfDto {

    // Name of the Quick Access section
    private String section;
    private String court;
    private String district;
    private String fileName;
    private Long sizeBytes;
    private LocalDateTime updatedAt;

    // Builds the DTO, last update falls back to the creation time
    public static DistrictPdfDto from(DistrictPdf p) {
        return DistrictPdfDto.builder()
                .section(p.getSection().name())
                .court(p.getCourt())
                .district(p.getDistrict())
                .fileName(p.getPdfFileName())
                .sizeBytes(p.getPdfSizeBytes())
                .updatedAt(p.getUpdatedAt() != null ? p.getUpdatedAt() : p.getCreatedAt())
                .build();
    }
}
