package com.internyay.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

// Contact form on the landing page, for visitors who are not logged in
@Data
public class ContactPublicRequest {

    @Size(max = 100, message = "Name must be 100 characters or fewer")
    public String name;

    @NotBlank(message = "Enter your email")
    @Email(message = "Enter a valid email address")
    @Size(max = 190, message = "Email is too long")
    public String email;

    @NotBlank(message = "Write a short description")
    @Size(min = 10, max = 3000, message = "Description must be between 10 and 3000 characters")
    public String description;
}
