package com.internyay.service;

import com.internyay.entity.PasswordResetOtp;
import com.internyay.entity.User;
import com.internyay.repository.PasswordResetOtpRepository;
import com.internyay.repository.UserRepository;
import com.internyay.util.Emails;
import com.internyay.util.PasswordPolicy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;

// Forgot password flow with an emailed OTP
@Service
public class PasswordResetService {

    private static final String DIGITS = "0123456789";

    private final SecureRandom random = new SecureRandom();

    private final PasswordResetOtpRepository otpRepo;
    private final UserRepository userRepo;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    private final int expiryMinutes;
    private final int resendCooldownSeconds;
    private final int maxAttempts;

    public PasswordResetService(
            PasswordResetOtpRepository otpRepo,
            UserRepository userRepo,
            PasswordEncoder passwordEncoder,
            EmailService emailService,
            @Value("${internyay.otp.expiry-minutes:10}") int expiryMinutes,
            @Value("${internyay.otp.resend-cooldown-seconds:45}") int resendCooldownSeconds,
            @Value("${internyay.otp.max-attempts:5}") int maxAttempts) {

        this.otpRepo = otpRepo;
        this.userRepo = userRepo;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
        this.expiryMinutes = expiryMinutes;
        this.resendCooldownSeconds = resendCooldownSeconds;
        this.maxAttempts = maxAttempts;
    }

    // Same email can be an advocate and an associate, the account type picks which
    private static String roleOf(String accountType) {
        return "ASSOCIATE".equalsIgnoreCase(accountType) ? User.ASSOCIATE : User.ADVOCATE;
    }

    // Sends a code if the account exists, the reply doesn't reveal whether it does
    @Transactional
    public void sendOtp(String rawEmail, String accountType) {

        String email = normalise(rawEmail);
        String role = roleOf(accountType);
        LocalDateTime now = LocalDateTime.now();

        User user = userRepo.findByEmailAndRole(email, role).orElse(null);

        if (user == null) {
            return;
        }

        PasswordResetOtp existing = otpRepo.findByEmailAndRole(email, role).orElse(null);

        if (existing != null && existing.getLastSentAt() != null) {
            long secondsSinceLastSend = Duration.between(existing.getLastSentAt(), now).getSeconds();
            if (secondsSinceLastSend < resendCooldownSeconds) {
                long wait = resendCooldownSeconds - secondsSinceLastSend;
                throw new IllegalArgumentException(
                        "Please wait " + wait + "s before requesting another code");
            }
        }

        String code = generateCode();

        emailService.sendPasswordResetOtp(email, user.getName(), code, expiryMinutes);

        PasswordResetOtp otp = existing != null ? existing : new PasswordResetOtp();
        otp.setEmail(email);
        otp.setRole(role);
        otp.setCodeHash(passwordEncoder.encode(code));
        otp.setExpiresAt(now.plusMinutes(expiryMinutes));
        otp.setAttempts(0);
        otp.setLastSentAt(now);

        otpRepo.save(otp);
    }

    // Checks the code and sets the new password (rules in PasswordPolicy)
    @Transactional
    public void resetPassword(String rawEmail, String accountType, String code,
                               String newPassword, String confirmPassword) {

        PasswordPolicy.require(newPassword, rawEmail);
        if (!newPassword.equals(confirmPassword)) {
            throw new IllegalArgumentException("Passwords do not match");
        }

        String email = normalise(rawEmail);
        String role = roleOf(accountType);

        PasswordResetOtp otp = otpRepo.findByEmailAndRole(email, role)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Request a new verification code first"));

        if (LocalDateTime.now().isAfter(otp.getExpiresAt())) {
            throw new IllegalArgumentException("That code has expired — request a new one");
        }

        if (otp.getAttempts() != null && otp.getAttempts() >= maxAttempts) {
            throw new IllegalArgumentException("Too many incorrect attempts — request a new code");
        }

        if (code == null || !passwordEncoder.matches(code, otp.getCodeHash())) {
            otp.setAttempts((otp.getAttempts() == null ? 0 : otp.getAttempts()) + 1);
            otpRepo.save(otp);
            throw new IllegalArgumentException("Incorrect code");
        }

        User user = userRepo.findByEmailAndRole(email, role)
                .orElseThrow(() -> new IllegalArgumentException("Account not found"));

        user.setPassword(passwordEncoder.encode(newPassword));
        user.setPasswordSet(true);
        user.setPasswordChangedAt(LocalDateTime.now());
        userRepo.save(user);

        otpRepo.deleteByEmailAndRole(email, role);
    }

    // Random 6 digit code
    private String generateCode() {
        StringBuilder sb = new StringBuilder(6);
        for (int i = 0; i < 6; i++) {
            sb.append(DIGITS.charAt(random.nextInt(DIGITS.length())));
        }
        return sb.toString();
    }

    // Lower case, trimmed email
    private static String normalise(String email) {
        return Emails.normalize(email);
    }
}
