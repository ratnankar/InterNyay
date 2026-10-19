package com.internyay.controller;

import com.internyay.dto.*;
import com.internyay.service.AdminService;
import com.internyay.service.LoginLogService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Admin console: advocate account management, admin only
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final AdminService admin;
    private final AuthHelper auth;
    private final LoginLogService loginLogService;

    // Overview numbers for the admin dashboard
    @GetMapping("/stats")
    public ResponseEntity<AdminStatsDto> stats() {
        return ResponseEntity.ok(admin.stats());
    }

    // Sign-in history: type is LOGIN, LOGIN_FAILED or LOGOUT (empty for all), app is WEB or CALENDAR (empty for both), q searches email and IP address, userId / email show one account only
    @GetMapping("/login-logs")
    public ResponseEntity<LoginLogPageDto> loginLogs(@RequestParam(required = false) String type,
                                                     @RequestParam(required = false) String app,
                                                     @RequestParam(required = false) String q,
                                                     @RequestParam(required = false) Long userId,
                                                     @RequestParam(required = false) String email,
                                                     @RequestParam(defaultValue = "0") int page,
                                                     @RequestParam(defaultValue = "25") int size) {
        return ResponseEntity.ok(loginLogService.search(type, app, q, userId, email, page, size));
    }

    // All advocate and associate accounts
    @GetMapping("/users")
    public ResponseEntity<List<UserDto>> users() {
        return ResponseEntity.ok(admin.listUsers());
    }

    // Admin creates an account directly
    @PostMapping("/users")
    public ResponseEntity<UserDto> createUser(@Valid @RequestBody AdminUserRequest req) {
        return ResponseEntity.ok(admin.createUser(req));
    }

    // Edit account details, plan, active flag
    @PutMapping("/users/{id}")
    public ResponseEntity<UserDto> updateUser(@PathVariable Long id,
                                              @Valid @RequestBody AdminUserRequest req) {
        return ResponseEntity.ok(admin.updateUser(id, req, auth.currentUserId()));
    }

    // Promotes an advocate to administrator, only an existing admin can call this
    @PostMapping("/users/{id}/promote")
    public ResponseEntity<UserDto> promote(@PathVariable Long id,
                                           @Valid @RequestBody PasswordConfirmRequest req) {
        return ResponseEntity.ok(admin.promoteToAdmin(id, req.getPassword(), auth.currentUserId()));
    }

    // Emails the user a new temporary password
    @PostMapping("/users/{id}/reset-password")
    public ResponseEntity<Void> resetPassword(@PathVariable Long id) {
        admin.resetPassword(id, auth.currentUserId());
        return ResponseEntity.noContent().build();
    }

    // Deletes the account along with its data, after the acting admin re-enters their own password
    @DeleteMapping("/users/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id,
                                           @Valid @RequestBody PasswordConfirmRequest req) {
        admin.deleteUser(id, req.getPassword(), auth.currentUserId());
        return ResponseEntity.noContent().build();
    }
}
