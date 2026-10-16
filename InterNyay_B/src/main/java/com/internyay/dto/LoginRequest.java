package com.internyay.dto;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
// Email and password login
@Data
public class LoginRequest {
    @NotBlank public String email;
    @NotBlank public String password;

    // Advocate, associate or admin, since an email can exist under more than one
    public String accountType;
}
