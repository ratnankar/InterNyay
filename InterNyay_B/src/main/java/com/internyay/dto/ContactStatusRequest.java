package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

// Admin changes the status of a message
@Data
public class ContactStatusRequest {
    @NotBlank(message = "Status is required")
    public String status;
}
