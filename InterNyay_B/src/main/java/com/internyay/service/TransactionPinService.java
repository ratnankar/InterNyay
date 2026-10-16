package com.internyay.service;

import com.internyay.dto.UserDto;
import com.internyay.entity.User;
import com.internyay.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.NoSuchElementException;

// The 4-digit PIN that guards the Transactions page: create, check, change and reset
//
// The methods here are deliberately not @Transactional. A wrong guess throws, and a
// transaction would roll the attempt counter back, so each save commits on its own.
@Service
public class TransactionPinService {

    // After this many wrong PINs in a row the PIN is locked for a while
    private static final int MAX_ATTEMPTS = 5;
    private static final int LOCK_MINUTES = 15;

    private final UserRepository userRepo;
    private final PasswordEncoder passwordEncoder;
    private final QrCodeService qrCodeService;
    private final GoogleTokenVerifier googleVerifier;

    public TransactionPinService(UserRepository userRepo,
                                 PasswordEncoder passwordEncoder,
                                 QrCodeService qrCodeService,
                                 GoogleTokenVerifier googleVerifier) {
        this.userRepo = userRepo;
        this.passwordEncoder = passwordEncoder;
        this.qrCodeService = qrCodeService;
        this.googleVerifier = googleVerifier;
    }

    // Checks the PIN to open the Transactions page
    public void verify(Long accountId, String pin) {

        User user = findUser(accountId);
        requirePinCreated(user);
        checkPin(user, pin);
    }

    // Replaces the PIN, the current one must be right
    public UserDto change(Long accountId, String currentPin, String newPin) {

        User user = findUser(accountId);
        requirePinCreated(user);
        checkPin(user, currentPin);

        if (passwordEncoder.matches(newPin, user.getTxnPin())) {
            throw new IllegalArgumentException("The new PIN must be different from your current PIN");
        }

        return store(user, newPin);
    }

    // Creates the first PIN or replaces a forgotten one.
    //   - the first PIN needs no password: there is no PIN to protect yet and the user is already signed in
    //   - a forgotten PIN is reset with the account password, which also clears any lock from earlier wrong guesses
    //   - accounts that signed up with Google have no password, so they confirm a reset with a fresh Google sign-in for the same Google account
    public UserDto resetWithPassword(Long accountId, String password, String googleIdToken, String newPin) {

        User user = findUser(accountId);

        // First PIN: nothing to confirm
        if (!user.hasTxnPin()) {
            return store(user, newPin);
        }

        if (user.hasPassword()) {
            if (password == null || !passwordEncoder.matches(password, user.getPassword())) {
                throw new IllegalArgumentException("Incorrect password");
            }
            return store(user, newPin);
        }

        // No password and a PIN already exists: the same Google account must confirm it is the owner
        if (googleIdToken == null || googleIdToken.isBlank()) {
            throw new IllegalArgumentException("Confirm with Google to reset your PIN");
        }

        GoogleTokenVerifier.GoogleIdentity google = googleVerifier.verify(googleIdToken);

        if (user.getGoogleId() == null || !user.getGoogleId().equals(google.subject())) {
            throw new IllegalArgumentException("That Google account does not match this account");
        }

        return store(user, newPin);
    }

    // Saves a new PIN as a hash and clears the lock
    private UserDto store(User user, String newPin) {

        user.setTxnPin(passwordEncoder.encode(newPin));
        user.setTxnPinAttempts(0);
        user.setTxnPinLockedUntil(null);
        user.setTxnPinChangedAt(LocalDateTime.now());

        User saved = userRepo.save(user);
        return UserDto.fromSelf(saved, qrCodeService.resolve(saved.getQrCodeId()));
    }

    // Compares the PIN, counts wrong guesses and locks after too many
    private void checkPin(User user, String pin) {

        LocalDateTime now = LocalDateTime.now();

        if (user.getTxnPinLockedUntil() != null && now.isBefore(user.getTxnPinLockedUntil())) {
            long minutes = Math.max(1, Duration.between(now, user.getTxnPinLockedUntil()).toMinutes() + 1);
            throw new IllegalArgumentException(
                    "Too many wrong attempts. Try again in " + minutes
                            + " minute" + (minutes == 1 ? "" : "s") + ", or reset your PIN.");
        }

        if (pin != null && passwordEncoder.matches(pin, user.getTxnPin())) {
            if (user.getTxnPinAttempts() != null && user.getTxnPinAttempts() > 0) {
                user.setTxnPinAttempts(0);
                user.setTxnPinLockedUntil(null);
                userRepo.save(user);
            }
            return;
        }

        // A lock that has run out starts the count again
        int attempts = (user.getTxnPinLockedUntil() != null ? 0
                : user.getTxnPinAttempts() == null ? 0 : user.getTxnPinAttempts()) + 1;

        if (attempts >= MAX_ATTEMPTS) {
            user.setTxnPinAttempts(0);
            user.setTxnPinLockedUntil(now.plusMinutes(LOCK_MINUTES));
            userRepo.save(user);
            throw new IllegalArgumentException(
                    "Too many wrong attempts. The PIN is locked for " + LOCK_MINUTES
                            + " minutes. You can reset it.");
        }

        user.setTxnPinAttempts(attempts);
        user.setTxnPinLockedUntil(null);
        userRepo.save(user);

        int left = MAX_ATTEMPTS - attempts;
        throw new IllegalArgumentException(
                "Incorrect PIN. " + left + " attempt" + (left == 1 ? "" : "s") + " left.");
    }

    // The PIN has to be created before it can be checked or changed
    private void requirePinCreated(User user) {
        if (!user.hasTxnPin()) {
            throw new IllegalArgumentException("Create a transaction PIN first");
        }
    }

    private User findUser(Long accountId) {
        return userRepo.findById(accountId)
                .orElseThrow(() -> new NoSuchElementException("Account not found"));
    }
}
