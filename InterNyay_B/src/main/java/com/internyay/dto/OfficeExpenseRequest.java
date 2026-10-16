package com.internyay.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

// Body to add an office expense
@Data
public class OfficeExpenseRequest {

    @Size(min = 1, max = 255, message = "Description is required")
    public String description;

    @NotNull(message = "Amount is required")
    public BigDecimal amount;

    @Size(max = 255)
    public String upiId;

    // QR code image as base64 text
    public String qrImage;
}
