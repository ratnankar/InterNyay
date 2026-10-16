package com.internyay.controller;

import com.internyay.dto.*;
import com.internyay.service.AuthService;
import com.internyay.service.EmailChangeService;
import com.internyay.service.LoginLogService;
import com.internyay.service.OtpService;
import com.internyay.service.PasswordResetService;
import com.internyay.service.TransactionPinService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

// Login, registration, profile and account lifecycle
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final AuthHelper authHelper;
    private final OtpService otpService;
    private final PasswordResetService passwordResetService;
    private final EmailChangeService emailChangeService;
    private final TransactionPinService transactionPinService;
    private final LoginLogService loginLogService;

    // Email + password login, returns JWT and user
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest req) {
        return ResponseEntity.ok(authService.login(req));
    }

    // The app calls this when someone signs out so the admin login log can show it, the token itself just expires
    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        loginLogService.logout(authHelper.currentAccount());
        return ResponseEntity.noContent().build();
    }

    // Sign in with a Google ID token
    @PostMapping("/google/login")
    public ResponseEntity<LoginResponse> googleLogin(@Valid @RequestBody GoogleLoginRequest req) {
        return ResponseEntity.ok(authService.googleLogin(req));
    }

    // Create an account from a Google ID token
    @PostMapping("/google/register")
    public ResponseEntity<LoginResponse> googleRegister(@Valid @RequestBody GoogleRegisterRequest req) {
        return ResponseEntity.ok(authService.googleRegister(req));
    }

    // Step 1 of registration: email a verification code
    @PostMapping("/register/send-otp")
    public ResponseEntity<Map<String, String>> sendRegistrationOtp(@Valid @RequestBody SendOtpRequest req) {
        otpService.sendOtp(req.getEmail(), req.getName());
        return ResponseEntity.ok(Map.of("message", "Verification code sent"));
    }

    // Step 2: check the code the user typed
    @PostMapping("/register/verify-otp")
    public ResponseEntity<Map<String, String>> verifyRegistrationOtp(@Valid @RequestBody VerifyOtpRequest req) {
        otpService.verifyOtp(req.getEmail(), req.getOtp());
        return ResponseEntity.ok(Map.of("message", "Email verified"));
    }

    // Step 3: create the account once the email is verified
    @PostMapping("/register")
    public ResponseEntity<LoginResponse> register(@Valid @RequestBody RegisterRequest req) {
        return ResponseEntity.ok(authService.register(req));
    }

    // Currently logged in user
    @GetMapping("/me")
    public ResponseEntity<UserDto> me() {
        return ResponseEntity.ok(authService.me(authHelper.currentAccountId()));
    }

    // Update own profile, password change goes through here too
    @PutMapping("/me")
    public ResponseEntity<UserDto> updateMe(@Valid @RequestBody UpdateProfileRequest req) {
        return ResponseEntity.ok(authService.updateProfile(authHelper.currentAccountId(), req));
    }

    // Google sign-up sets its first password, no code needed
    @PostMapping("/me/set-password")
    public ResponseEntity<UserDto> setPassword(@Valid @RequestBody SetPasswordRequest req) {
        return ResponseEntity.ok(authService.setInitialPassword(authHelper.currentAccountId(), req));
    }

    // Send an OTP to the new email address
    @PostMapping("/me/email/send-otp")
    public ResponseEntity<Map<String, String>> requestEmailChange(@Valid @RequestBody RequestEmailChangeRequest req) {
        emailChangeService.requestChange(authHelper.currentAccountId(), req);
        return ResponseEntity.ok(Map.of("message", "Verification code sent to the new email address"));
    }

    // Confirm the OTP and switch the email
    @PostMapping("/me/email/confirm")
    public ResponseEntity<UserDto> confirmEmailChange(@Valid @RequestBody ConfirmEmailChangeRequest req) {
        return ResponseEntity.ok(emailChangeService.confirmChange(authHelper.currentAccountId(), req));
    }

    // Open the Transactions page: check the 4-digit PIN
    @PostMapping("/txn-pin/verify")
    public ResponseEntity<Void> verifyTxnPin(@Valid @RequestBody TxnPinRequests.Verify req) {
        authHelper.requireNotAssociate();
        transactionPinService.verify(authHelper.currentAccountId(), req.getPin());
        return ResponseEntity.noContent().build();
    }

    // Change the PIN using the current one
    @PostMapping("/txn-pin/change")
    public ResponseEntity<UserDto> changeTxnPin(@Valid @RequestBody TxnPinRequests.Change req) {
        authHelper.requireNotAssociate();
        return ResponseEntity.ok(transactionPinService.change(
                authHelper.currentAccountId(), req.getCurrentPin(), req.getNewPin()));
    }

    // Create the first PIN, or reset a forgotten one, by entering the account password.
    // Google sign-ups without a password skip it for the first PIN and confirm with Google to reset
    @PostMapping("/txn-pin/reset")
    public ResponseEntity<UserDto> resetTxnPin(@Valid @RequestBody TxnPinRequests.Reset req) {
        authHelper.requireNotAssociate();
        return ResponseEntity.ok(transactionPinService.resetWithPassword(
                authHelper.currentAccountId(), req.getPassword(), req.getGoogleIdToken(), req.getNewPin()));
    }

    // Forgot password step 1: email a reset code
    @PostMapping("/forgot-password/send-otp")
    public ResponseEntity<Map<String, String>> sendForgotPasswordOtp(@Valid @RequestBody ForgotPasswordRequest req) {
        passwordResetService.sendOtp(req.getEmail(), req.getAccountType());
        return ResponseEntity.ok(Map.of("message", "If that account exists, a verification code has been sent"));
    }

    // Forgot password step 2: set the new password with the code
    @PostMapping("/forgot-password/reset")
    public ResponseEntity<Map<String, String>> resetForgottenPassword(@Valid @RequestBody ResetPasswordRequest req) {
        passwordResetService.resetPassword(
                req.getEmail(), req.getAccountType(), req.getOtp(), req.getNewPassword(), req.getConfirmPassword());
        return ResponseEntity.ok(Map.of("message", "Password updated — please sign in"));
    }

    // Deactivate own account, needs the password
    @PostMapping("/me/deactivate")
    public ResponseEntity<Void> deactivateMe(@Valid @RequestBody PasswordConfirmRequest req) {
        authService.deactivateAccount(authHelper.currentAccountId(), req.getPassword());
        return ResponseEntity.noContent().build();
    }

    // Permanently delete own account, needs the password
    @PostMapping("/me/delete")
    public ResponseEntity<Void> deleteMe(@Valid @RequestBody PasswordConfirmRequest req) {
        authService.deleteAccount(authHelper.currentAccountId(), req.getPassword());
        return ResponseEntity.noContent().build();
    }

    // Advocate's list of associates
    @GetMapping("/associates")
    public ResponseEntity<List<AssociateDto>> associates() {
        authHelper.requireNotAssociate();
        return ResponseEntity.ok(authService.associatesOf(authHelper.currentAccountId()));
    }

    // Advocate removes one of their associates
    @DeleteMapping("/associates/{id}")
    public ResponseEntity<Void> removeAssociate(@PathVariable Long id) {
        authHelper.requireNotAssociate();
        authService.removeAssociate(authHelper.currentAccountId(), id);
        return ResponseEntity.noContent().build();
    }
}
