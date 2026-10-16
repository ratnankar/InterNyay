package com.internyay.dto;

import java.time.LocalDateTime;
import com.internyay.entity.StageFee;
import lombok.*;

import java.math.BigDecimal;

// Fee of one case stage as sent to the frontend
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class StageFeeDto {

    public Long id;
    public String name;
    public BigDecimal amount;
    public boolean paid;
    public LocalDateTime paidAt;

    // Builds the DTO from the entity
    public static StageFeeDto from(StageFee f) {
        return StageFeeDto.builder()
                .id(f.getId())
                .name(f.getName())
                .amount(f.getAmount())
                .paid(f.isPaid())
                .paidAt(f.getPaidAt())
                .build();
    }
}
