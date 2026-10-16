package com.internyay.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

// Reply written by the admin
@Data
public class ContactReplyRequest {

    @NotBlank(message = "Write a reply")
    @Size(max = 3000, message = "Reply must be 3000 characters or fewer")
    public String body;

    // EMAIL, ACCOUNT or BOTH
    public String channel;
}
