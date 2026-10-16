package com.internyay.service;

import com.internyay.dto.ConfirmEmailChangeRequest;
import com.internyay.dto.RequestEmailChangeRequest;
import com.internyay.dto.UserDto;
import com.internyay.entity.EmailChangeOtp;
import com.internyay.entity.User;
import com.internyay.repository.EmailChangeOtpRepository;
import com.internyay.repository.UserRepository;
import com.internyay.util.Emails;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.NoSuchElementException;

// Changing the account email: an OTP is sent to the new address and must be confirmed
@Service
public class EmailChangeService {

    private static final String DIGITS = "0123456789";

    private final SecureRandom random = new SecureRandom();

    private final EmailChangeOtpRepository otpRepo;
    private final UserRepository userRepo;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;
    private final QrCodeService qrCodeService;

    private final int expiryMinutes;
    private final int resendCooldownSeconds;
    private final int maxAttempts;

    public EmailChangeService(
            EmailChangeOtpRepository otpRepo,
            UserRepository userRepo,
            PasswordEncoder passwordEncoder,
            EmailService emailService,
            QrCodeService qrCodeService,
            @Value("${internyay.otp.expiry-minutes:10}") int expiryMinutes,
            @Value("${internyay.otp.resend-cooldown-seconds:45}") int resendCooldownSeconds,
            @Value("${internyay.otp.max-attempts:5}") int maxAttempts) {

        this.otpRepo = otpRepo;
        this.userRepo = userRepo;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
        this.qrCodeService = qrCodeService;
        this.expiryMinutes = expiryMinutes;
        this.resendCooldownSeconds = resendCooldownSeconds;
        this.maxAttempts = maxAttempts;
    }

    // Step 1: validate the new email and send the code, accounts without a password can't change email
    @Transactional
    public void requestChange(Long accountId, RequestEmailChangeRequest req) {

        User user = userRepo.findById(accountId)
                .orElseThrow(() -> new NoSuchElementException("Account not found"));

        if (!user.hasPassword()) throw new IllegalArgumentException(User.NO_PASSWORD_MESSAGE);

        if (req.getPassword() == null || !passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Current password is incorrect");
        }

        String newEmail = Emails.normalize(req.getNewEmail());

        if (newEmail.equalsIgnoreCase(user.getEmail())) {
            throw new IllegalArgumentException("That's already the email on this account");
        }

        if (userRepo.existsByEmailAndRole(newEmail, user.getRole())) {
            throw new IllegalArgumentException("That email is already in use by another account");
        }

        LocalDateTime now = LocalDateTime.now();
        EmailChangeOtp existing = otpRepo.findByAccountId(accountId).orElse(null);

        if (existing != null && existing.getLastSentAt() != null) {
            long secondsSinceLastSend = Duration.between(existing.getLastSentAt(), now).getSeconds();
            if (secondsSinceLastSend < resendCooldownSeconds) {
                long wait = resendCooldownSeconds - secondsSinceLastSend;
                throw new IllegalArgumentException(
                        "Please wait " + wait + "s before requesting another code");
            }
        }

        String code = generateCode();

        emailService.sendEmailChangeOtp(newEmail, user.getName(), code, expiryMinutes);

        EmailChangeOtp otp = existing != null ? existing : new EmailChangeOtp();
        otp.setAccountId(accountId);
        otp.setNewEmail(newEmail);
        otp.setCodeHash(passwordEncoder.encode(code));
        otp.setExpiresAt(now.plusMinutes(expiryMinutes));
        otp.setAttempts(0);
        otp.setLastSentAt(now);

        otpRepo.save(otp);
    }

    // Step 2: check the code and switch the email
    @Transactional
    public UserDto confirmChange(Long accountId, ConfirmEmailChangeRequest req) {

        EmailChangeOtp otp = otpRepo.findByAccountId(accountId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "No email change is pending — request a code first"));

        if (LocalDateTime.now().isAfter(otp.getExpiresAt())) {
            throw new IllegalArgumentException("That code has expired — request a new one");
        }

        if (otp.getAttempts() != null && otp.getAttempts() >= maxAttempts) {
            throw new IllegalArgumentException("Too many incorrect attempts — request a new code");
        }

        if (req.getOtp() == null || !passwordEncoder.matches(req.getOtp(), otp.getCodeHash())) {
            otp.setAttempts((otp.getAttempts() == null ? 0 : otp.getAttempts()) + 1);
            otpRepo.save(otp);
            throw new IllegalArgumentException("Incorrect code");
        }

        User user = userRepo.findById(accountId)
                .orElseThrow(() -> new NoSuchElementException("Account not found"));

        if (userRepo.existsByEmailAndRole(otp.getNewEmail(), user.getRole())) {
            otpRepo.deleteByAccountId(accountId);
            throw new IllegalArgumentException("That email is already in use by another account");
        }

        user.setEmail(otp.getNewEmail());
        User saved = userRepo.save(user);

        otpRepo.deleteByAccountId(accountId);

        return UserDto.fromSelf(saved, qrCodeService.resolve(saved.getQrCodeId()));
    }

    // Random 6 digit code
    private String generateCode() {
        StringBuilder sb = new StringBuilder(6);
        for (int i = 0; i < 6; i++) {
            sb.append(DIGITS.charAt(random.nextInt(DIGITS.length())));
        }
        return sb.toString();
    }
}
