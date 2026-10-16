package com.internyay.dto;

import com.internyay.entity.CourtCalendar;
import lombok.*;

// Court calendar details, the PDF is downloaded separately
@Getter @Builder
public class CourtCalendarDto {

    private Long id;
    private Integer year;
    private String fileName;

    // Builds the DTO from the entity
    public static CourtCalendarDto from(CourtCalendar c) {
        return CourtCalendarDto.builder()
                .id(c.getId())
                .year(c.getYear())
                .fileName(c.getFileName())
                .build();
    }
}
