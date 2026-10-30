package com.internyay.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

// Message sent by a logged in user from the help section
@Data
public class ContactRequest {

    @NotBlank(message = "Choose what your message is about")
    public String category;

    // Optional: when left empty the topic is used as the subject
    @Size(max = 150, message = "Subject must be 150 characters or fewer")
    public String subject;

    @NotBlank(message = "Write your message")
    @Size(min = 10, max = 3000, message = "Message must be between 10 and 3000 characters")
    public String message;
}
