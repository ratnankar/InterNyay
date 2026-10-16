package com.internyay.dto;

import com.internyay.entity.OfficeExpense;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

// Office expense as sent to the frontend
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class OfficeExpenseDto {

    public Long id;
    public String description;
    public BigDecimal amount;
    public String upiId;
    // QR code of the person to be paid
    public String qrImage;
    public boolean paid;
    public LocalDateTime paidAt;
    public LocalDateTime createdAt;

    // Who added the expense
    public Long submittedById;
    public String submittedByName;
    // True when the advocate added it, false for an associate
    public boolean submittedByAdvocate;

    // Builds the DTO from the entity, the QR image is fetched separately
    public static OfficeExpenseDto from(OfficeExpense e, String qrImage) {
        return OfficeExpenseDto.builder()
                .id(e.getId())
                .description(e.getDescription())
                .amount(e.getAmount())
                .upiId(e.getUpiId())
                .qrImage(qrImage)
                .paid(e.isPaid())
                .paidAt(e.getPaidAt())
                .createdAt(e.getCreatedAt())
                .submittedById(e.getSubmittedBy().getId())
                .submittedByName(e.getSubmittedBy().getName())
                .submittedByAdvocate(e.getSubmittedBy().isAdvocate())
                .build();
    }
}
