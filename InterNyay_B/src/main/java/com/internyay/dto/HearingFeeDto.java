package com.internyay.dto;

import java.time.LocalDateTime;
import com.internyay.entity.HearingFee;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

// Fee of one hearing as sent to the frontend
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class HearingFeeDto {

    public Long id;
    public LocalDate date;
    public BigDecimal amount;
    public BigDecimal amountReceived;
    public boolean paid;
    public LocalDateTime paidAt;

    // Builds the DTO from the entity
    public static HearingFeeDto from(HearingFee h) {
        return HearingFeeDto.builder()
                .id(h.getId())
                .date(h.getDate())
                .amount(h.getAmount())
                .amountReceived(h.getAmountReceived())
                .paid(h.isPaid())
                .paidAt(h.getPaidAt())
                .build();
    }
}
