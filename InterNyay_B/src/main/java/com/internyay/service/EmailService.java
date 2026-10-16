package com.internyay.service;

import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

// Sends all outgoing mail through Gmail SMTP
@Service
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;
    private final String fromAddress;
    private final String fromName;
    private final boolean dryRun;

    public EmailService(
            JavaMailSender mailSender,
            @Value("${spring.mail.username:}") String fromAddress,
            @Value("${internyay.otp.from-name:InterNyay}") String fromName,
            @Value("${internyay.otp.dry-run:false}") boolean dryRun) {

        this.mailSender = mailSender;
        this.fromAddress = fromAddress == null ? "" : fromAddress.trim();
        this.fromName = fromName;
        this.dryRun = dryRun;
    }

    // True when a sender address is set
    public boolean isConfigured() {
        return !fromAddress.isEmpty();
    }

    // In dry run mode mails are only logged, not sent
    public boolean isDryRun() {
        return dryRun;
    }

    // Registration verification code
    public void sendOtp(String toEmail, String recipientName, String code, int expiryMinutes) {

        if (dryRun) {
            log.info("OTP email DRY RUN → {} code={} (expires in {} min)", toEmail, code, expiryMinutes);
            return;
        }

        if (!isConfigured()) {
            throw new IllegalStateException(
                    "Email is not set up on the server yet (GMAIL_USERNAME / GMAIL_APP_PASSWORD are missing)");
        }

        String greetingName = (recipientName == null || recipientName.isBlank())
                ? "there" : recipientName.trim();

        String body = "Hi " + greetingName + ",\n\n"
                + "Your InterNyay verification code is: " + code + "\n\n"
                + "This code expires in " + expiryMinutes + " minutes. If you didn't request this, "
                + "you can safely ignore this email.\n\n"
                + "— InterNyay";

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(fromAddress, fromName);
            helper.setTo(toEmail);
            helper.setSubject("Your InterNyay verification code is " + code);
            helper.setText(body, false);
            mailSender.send(message);

        } catch (MailException ex) {
            log.warn("OTP email to {} failed: {}", toEmail, ex.getMessage());
            throw new IllegalStateException("Could not send the verification email (" + ex.getMessage() + ")");
        } catch (Exception ex) {
            log.warn("OTP email to {} failed: {}", toEmail, ex.getMessage());
            throw new IllegalStateException("Could not send the verification email");
        }
    }

    // Forgot password code
    public void sendPasswordResetOtp(String toEmail, String recipientName, String code, int expiryMinutes) {

        if (dryRun) {
            log.info("Password reset email DRY RUN → {} code={} (expires in {} min)", toEmail, code, expiryMinutes);
            return;
        }

        if (!isConfigured()) {
            throw new IllegalStateException(
                    "Email is not set up on the server yet (GMAIL_USERNAME / GMAIL_APP_PASSWORD are missing)");
        }

        String greetingName = (recipientName == null || recipientName.isBlank())
                ? "there" : recipientName.trim();

        String body = "Hi " + greetingName + ",\n\n"
                + "We received a request to reset your InterNyay password. Your verification code is: " + code + "\n\n"
                + "This code expires in " + expiryMinutes + " minutes. If you didn't request this, "
                + "you can safely ignore this email — your password will not be changed.\n\n"
                + "— InterNyay";

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(fromAddress, fromName);
            helper.setTo(toEmail);
            helper.setSubject("Your InterNyay password reset code is " + code);
            helper.setText(body, false);
            mailSender.send(message);

        } catch (MailException ex) {
            log.warn("Password reset email to {} failed: {}", toEmail, ex.getMessage());
            throw new IllegalStateException("Could not send the password reset email (" + ex.getMessage() + ")");
        } catch (Exception ex) {
            log.warn("Password reset email to {} failed: {}", toEmail, ex.getMessage());
            throw new IllegalStateException("Could not send the password reset email");
        }
    }

    // Temporary password after an admin reset
    public void sendTemporaryPassword(String toEmail, String recipientName, String tempPassword) {

        if (dryRun) {
            log.info("Temporary password email DRY RUN → {} password={}", toEmail, tempPassword);
            return;
        }

        if (!isConfigured()) {
            throw new IllegalStateException(
                    "Email is not set up on the server yet (GMAIL_USERNAME / GMAIL_APP_PASSWORD are missing)");
        }

        String greetingName = (recipientName == null || recipientName.isBlank())
                ? "there" : recipientName.trim();

        String body = "Hi " + greetingName + ",\n\n"
                + "An administrator has reset your InterNyay password. Your temporary password is:\n\n"
                + tempPassword + "\n\n"
                + "Sign in with it, then change it right away from Profile → Change Password. "
                + "If you didn't expect this, please contact your administrator.\n\n"
                + "— InterNyay";

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(fromAddress, fromName);
            helper.setTo(toEmail);
            helper.setSubject("Your InterNyay temporary password");
            helper.setText(body, false);
            mailSender.send(message);

        } catch (MailException ex) {
            log.warn("Temporary password email to {} failed: {}", toEmail, ex.getMessage());
            throw new IllegalStateException("Could not send the temporary password email (" + ex.getMessage() + ")");
        } catch (Exception ex) {
            log.warn("Temporary password email to {} failed: {}", toEmail, ex.getMessage());
            throw new IllegalStateException("Could not send the temporary password email");
        }
    }

    // Code for confirming a new email address
    public void sendEmailChangeOtp(String toEmail, String recipientName, String code, int expiryMinutes) {

        if (dryRun) {
            log.info("Email change email DRY RUN → {} code={} (expires in {} min)", toEmail, code, expiryMinutes);
            return;
        }

        if (!isConfigured()) {
            throw new IllegalStateException(
                    "Email is not set up on the server yet (GMAIL_USERNAME / GMAIL_APP_PASSWORD are missing)");
        }

        String greetingName = (recipientName == null || recipientName.isBlank())
                ? "there" : recipientName.trim();

        String body = "Hi " + greetingName + ",\n\n"
                + "We received a request to change the email address on your InterNyay account to this "
                + "one. Your verification code is: " + code + "\n\n"
                + "This code expires in " + expiryMinutes + " minutes. If you didn't request this, "
                + "you can safely ignore this email — your account's email will not be changed.\n\n"
                + "— InterNyay";

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(fromAddress, fromName);
            helper.setTo(toEmail);
            helper.setSubject("Your InterNyay email change code is " + code);
            helper.setText(body, false);
            mailSender.send(message);

        } catch (MailException ex) {
            log.warn("Email change email to {} failed: {}", toEmail, ex.getMessage());
            throw new IllegalStateException("Could not send the verification email (" + ex.getMessage() + ")");
        } catch (Exception ex) {
            log.warn("Email change email to {} failed: {}", toEmail, ex.getMessage());
            throw new IllegalStateException("Could not send the verification email");
        }
    }

    // Tells the sender that admin replied to their message
    public void sendContactReplyNotification(String toEmail, String recipientName, String subject,
                                             String reply, boolean alsoInAccount, boolean visitor) {

        if (dryRun) {
            log.info("Contact reply email DRY RUN → {} subject={}", toEmail, subject);
            return;
        }

        if (!isConfigured()) {
            throw new IllegalStateException(
                    "Email is not set up on the server yet (GMAIL_USERNAME / GMAIL_APP_PASSWORD are missing)");
        }

        String greetingName = (recipientName == null || recipientName.isBlank())
                ? "there" : recipientName.trim();

        String body = "Hi " + greetingName + ",\n\n"
                + "We replied to your message \"" + subject + "\":\n\n"
                + reply + "\n\n"
                + (visitor
                    ? "If you have more questions, please write to us again from the InterNyay website.\n\n"
                    : alsoInAccount
                    ? "You can see the whole conversation in InterNyay under Contact Us.\n\n"
                    : "To follow up, please send a new message from Contact Us in InterNyay.\n\n")
                + "— InterNyay";

        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, false, "UTF-8");
            helper.setFrom(fromAddress, fromName);
            helper.setTo(toEmail);
            helper.setSubject("Re: " + subject);
            helper.setText(body, false);
            mailSender.send(mime);

        } catch (MailException ex) {
            log.warn("Contact reply email to {} failed: {}", toEmail, ex.getMessage());
            throw new IllegalStateException("Could not send the reply notification (" + ex.getMessage() + ")");
        } catch (Exception ex) {
            log.warn("Contact reply email to {} failed: {}", toEmail, ex.getMessage());
            throw new IllegalStateException("Could not send the reply notification");
        }
    }
}
