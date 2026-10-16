package com.internyay.service;

import com.internyay.entity.RegistrationOtp;
import com.internyay.repository.RegistrationOtpRepository;
import com.internyay.util.Emails;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;

// Email OTP for registration
@Service
public class OtpService {

    private static final String DIGITS = "0123456789";

    private final SecureRandom random = new SecureRandom();

    private final RegistrationOtpRepository otpRepo;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    private final int expiryMinutes;
    private final int verifiedWindowMinutes;
    private final int resendCooldownSeconds;
    private final int maxAttempts;

    public OtpService(
            RegistrationOtpRepository otpRepo,
            PasswordEncoder passwordEncoder,
            EmailService emailService,
            @Value("${internyay.otp.expiry-minutes:10}") int expiryMinutes,
            @Value("${internyay.otp.verified-window-minutes:30}") int verifiedWindowMinutes,
            @Value("${internyay.otp.resend-cooldown-seconds:45}") int resendCooldownSeconds,
            @Value("${internyay.otp.max-attempts:5}") int maxAttempts) {

        this.otpRepo = otpRepo;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
        this.expiryMinutes = expiryMinutes;
        this.verifiedWindowMinutes = verifiedWindowMinutes;
        this.resendCooldownSeconds = resendCooldownSeconds;
        this.maxAttempts = maxAttempts;
    }

    // Generate and email a code, repeated requests are limited
    @Transactional
    public void sendOtp(String rawEmail, String name) {

        String email = normalise(rawEmail);
        LocalDateTime now = LocalDateTime.now();

        RegistrationOtp existing = otpRepo.findByEmail(email).orElse(null);

        if (existing != null && existing.getLastSentAt() != null) {
            long secondsSinceLastSend = Duration.between(existing.getLastSentAt(), now).getSeconds();
            if (secondsSinceLastSend < resendCooldownSeconds) {
                long wait = resendCooldownSeconds - secondsSinceLastSend;
                throw new IllegalArgumentException(
                        "Please wait " + wait + "s before requesting another code");
            }
        }

        String code = generateCode();

        emailService.sendOtp(email, name, code, expiryMinutes);

        RegistrationOtp otp = existing != null ? existing : new RegistrationOtp();
        otp.setEmail(email);
        otp.setCodeHash(passwordEncoder.encode(code));
        otp.setExpiresAt(now.plusMinutes(expiryMinutes));
        otp.setVerified(false);
        otp.setAttempts(0);
        otp.setLastSentAt(now);

        otpRepo.save(otp);
    }

    // Check the code, wrong attempts are counted
    @Transactional
    public void verifyOtp(String rawEmail, String code) {

        String email = normalise(rawEmail);
        RegistrationOtp otp = otpRepo.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException(
                        "No verification code was sent to this email — request one first"));

        if (Boolean.TRUE.equals(otp.getVerified())) {
            return;
        }

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

        otp.setVerified(true);
        otp.setAttempts(0);
        otp.setExpiresAt(LocalDateTime.now().plusMinutes(verifiedWindowMinutes));
        otpRepo.save(otp);
    }

    // Registration is only allowed for an email that passed the check
    @Transactional(readOnly = true)
    public void requireVerified(String rawEmail) {

        String email = normalise(rawEmail);
        RegistrationOtp otp = otpRepo.findByEmail(email).orElse(null);

        boolean ok = otp != null
                && Boolean.TRUE.equals(otp.getVerified())
                && LocalDateTime.now().isBefore(otp.getExpiresAt());

        if (!ok) {
            throw new IllegalArgumentException(
                    "Please verify your email with the code we sent before completing registration");
        }
    }

    // Delete the OTP once the account is created
    @Transactional
    public void consume(String rawEmail) {
        otpRepo.deleteByEmail(normalise(rawEmail));
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
