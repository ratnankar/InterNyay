package com.internyay.dto;

import com.internyay.entity.Holiday;
import com.internyay.util.HolidayCourts;
import lombok.*;

import java.time.LocalDate;

// Holiday as sent to the frontend
@Getter @Builder
public class HolidayDto {

    private Long id;
    private LocalDate date;
    private String label;
    private String description;

    private String courtType;

    // Builds the DTO from the entity
    public static HolidayDto from(Holiday h) {
        return HolidayDto.builder()
                .id(h.getId())
                .date(h.getDate())
                .label(h.getLabel())
                .description(h.getDescription())
                .courtType(HolidayCourts.orDefault(h.getCourtType()))
                .build();
    }
}
