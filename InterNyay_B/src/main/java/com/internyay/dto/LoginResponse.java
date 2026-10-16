package com.internyay.dto;
import lombok.*;
// Returned after login: the token and the user
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class LoginResponse {
    public String token;
    public UserDto user;
    // True when the account was deactivated by the user and is active again
    public boolean reactivated;
    // True when "register with Google" found an account already linked to that Google email and signed the user in to it
    public boolean existingAccount;
}
