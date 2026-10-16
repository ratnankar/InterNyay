package com.internyay.controller;

import com.internyay.dto.AdminSetupRequest;
import com.internyay.repository.UserRepository;
import com.internyay.entity.User;
import com.internyay.service.AdminAccountService;
import com.internyay.service.AdminSetupGuard;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

// One-time creation of the first administrator. Public URL, protected by the setup key.
// Once any admin exists this endpoint refuses, further admins come from the admin console
@RestController
@RequestMapping("/api/admin/setup")
@RequiredArgsConstructor
public class AdminSetupController {

    private final AdminSetupGuard guard;
    private final AdminAccountService adminAccounts;
    private final UserRepository userRepo;

    @PostMapping
    public ResponseEntity<Map<String, String>> setupAdmin(
            @RequestHeader(value = "X-Admin-Setup-Key", required = false) String setupKey,
            @Valid @RequestBody AdminSetupRequest req,
            HttpServletRequest http) {

        switch (guard.check(http.getRemoteAddr(), setupKey)) {
            case DISABLED   -> { return reply(HttpStatus.NOT_FOUND, "Not found"); }
            case LOCKED     -> { return reply(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts, try again later"); }
            case WRONG_KEY  -> { return reply(HttpStatus.FORBIDDEN, "Invalid setup key"); }
            case OK         -> { /* continue */ }
        }

        // One-time: after the first admin, use the admin console instead
        if (userRepo.existsByRole(User.ADMIN)) {
            return reply(HttpStatus.CONFLICT,
                    "An administrator already exists. Sign in as admin and promote users from the console");
        }

        adminAccounts.promoteByEmail(req.getEmail());
        return reply(HttpStatus.OK, "Admin assigned successfully");
    }

    private static ResponseEntity<Map<String, String>> reply(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("message", message));
    }
}
