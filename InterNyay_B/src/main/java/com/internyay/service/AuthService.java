package com.internyay.service;

import com.internyay.util.ProfileImages;
import com.internyay.dto.*;
import com.internyay.entity.LoginLog.Method;
import com.internyay.entity.User;
import com.internyay.repository.UserRepository;
import com.internyay.security.JwtUtils;
import com.internyay.exception.TooManyAttemptsException;
import com.internyay.util.Emails;
import com.internyay.util.PasswordPolicy;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;
import java.util.NoSuchElementException;

// Login, registration, Google sign-in, profile and account lifecycle
@Service
public class AuthService implements UserDetailsService {

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 10;

    // Shown when one email has both an advocate and an associate account and the sign-in did not say which one
    static final String CHOOSE_ACCOUNT_MESSAGE =
            "This email has both an advocate and an associate account — choose which one to sign in to";

    // The app looks for this text to open the "add your phone number" popup after Google sign-up, keep both in step
    static final String PHONE_REQUIRED_MESSAGE = "Phone number is required to create your account";

    private final SecureRandom random = new SecureRandom();

    // 10 wrong passwords within 15 minutes lock that email's login for 15 minutes
    private final com.internyay.security.LoginAttemptLimiter loginLimiter =
            new com.internyay.security.LoginAttemptLimiter(10, java.time.Duration.ofMinutes(15), java.time.Duration.ofMinutes(15));

    private final UserRepository userRepo;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;
    private final AccountPurgeService accountPurgeService;
    private final OtpService otpService;
    private final QrCodeService qrCodeService;
    private final GoogleTokenVerifier googleVerifier;
    private final PlanService planService;
    private final LoginLogService loginLog;

    private final String dummyHash;

    public AuthService(UserRepository userRepo,
                       PasswordEncoder passwordEncoder,
                       JwtUtils jwtUtils,
                       AccountPurgeService accountPurgeService,
                       OtpService otpService,
                       QrCodeService qrCodeService,
                       GoogleTokenVerifier googleVerifier,
                       PlanService planService,
                       LoginLogService loginLog) {
        this.userRepo = userRepo;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtils = jwtUtils;
        this.accountPurgeService = accountPurgeService;
        this.otpService = otpService;
        this.qrCodeService = qrCodeService;
        this.googleVerifier = googleVerifier;
        this.planService = planService;
        this.loginLog = loginLog;
        // Used to compare against when the email is unknown so response time doesn't reveal whether it exists
        this.dummyHash = passwordEncoder.encode("internyay-timing-equaliser");
    }

    // Spring Security loads users by account id (the JWT subject), not by email
    @Override
    public UserDetails loadUserByUsername(String accountId) throws UsernameNotFoundException {

        Long id;
        try {
            id = Long.valueOf(accountId);
        } catch (NumberFormatException e) {
            throw new UsernameNotFoundException("Unknown account: " + accountId);
        }

        User user = userRepo.findById(id)
                .orElseThrow(() -> new UsernameNotFoundException("Unknown account: " + accountId));

        return toUserDetails(user);
    }

    // An associate is only enabled while its advocate is active too
    private UserDetails toUserDetails(User user) {

        String role = (user.getRole() == null || user.getRole().isBlank())
                ? User.ADVOCATE
                : user.getRole().toUpperCase();

        boolean enabled = !Boolean.FALSE.equals(user.getActive());

        if (user.isAssociate()) {
            User adv = user.getAdvocate();
            enabled = enabled && adv != null && !Boolean.FALSE.equals(adv.getActive());
        }

        return org.springframework.security.core.userdetails.User
                .withUsername(String.valueOf(user.getId()))
                .password(user.getPassword())
                .disabled(!enabled)
                .authorities(List.of(new SimpleGrantedAuthority("ROLE_" + role)))
                .build();
    }

    // Email + password login
    public LoginResponse login(LoginRequest req) {

        User user;
        try {
            user = authenticate(req);
        } catch (BadCredentialsException e) {
            loginLog.failure(Method.PASSWORD, null, Emails.normalize(req.getEmail()), req.getAccountType(), "Wrong email or password");
            throw e;
        } catch (TooManyAttemptsException e) {
            loginLog.failure(Method.PASSWORD, null, Emails.normalize(req.getEmail()), req.getAccountType(), "Blocked after too many failed attempts");
            throw e;
        }

        return completeLogin(user, Method.PASSWORD);
    }

    // Shared tail of every login: reactivate, check enabled, stamp last login, issue the JWT
    private LoginResponse completeLogin(User user, Method method) {

        boolean reactivated = reactivateIfSelfDeactivated(user);

        UserDetails ud = toUserDetails(user);
        if (!ud.isEnabled()) {
            loginLog.failure(method, user, user.getEmail(), user.getRole(), "Account deactivated");
            throw new DisabledException("This account has been deactivated");
        }

        ensureAdvocateCode(user);

        user.setLastLoginAt(java.time.LocalDateTime.now());
        userRepo.save(user);
        loginLog.success(user, method);

        return LoginResponse.builder()
                .token(jwtUtils.generateToken(ud))
                .user(UserDto.fromSelf(user, qrCodeService.resolve(user.getQrCodeId())))
                .reactivated(reactivated)
                .build();
    }

    // Logging in again brings back an account the user deactivated themselves
    private boolean reactivateIfSelfDeactivated(User user) {

        if (!Boolean.TRUE.equals(user.getSelfDeactivated()) || !Boolean.FALSE.equals(user.getActive())) {
            return false;
        }

        user.setActive(true);
        user.setSelfDeactivated(false);
        userRepo.save(user);
        return true;
    }

    // The same email can exist under different roles, so every allowed role is tried
    private User authenticate(LoginRequest req) {

        String email = Emails.normalize(req.getEmail());
        loginLimiter.check(email);
        String type  = req.getAccountType() == null ? "" : req.getAccountType().trim().toUpperCase();

        List<String> roles = switch (type) {
            case "ADVOCATE"  -> List.of(User.ADVOCATE);
            case "ASSOCIATE" -> List.of(User.ASSOCIATE);
            case "ADMIN"     -> List.of(User.ADMIN);
            // The normal sign-in page never logs in an admin, admins use /admin which sends accountType ADMIN
            default          -> List.of(User.ADVOCATE, User.ASSOCIATE);
        };

        boolean emailKnown = false;
        List<User> matches = new java.util.ArrayList<>();

        for (String role : roles) {
            User candidate = userRepo.findByEmailAndRole(email, role).orElse(null);
            if (candidate == null) continue;

            emailKnown = true;
            if (passwordEncoder.matches(req.getPassword(), candidate.getPassword())) {
                matches.add(candidate);
            }
        }

        // The password fits both an advocate and an associate account and the user did not say which one: ask, never guess
        if (matches.size() > 1) {
            throw new IllegalArgumentException(CHOOSE_ACCOUNT_MESSAGE);
        }
        if (matches.size() == 1) {
            loginLimiter.reset(email);
            return matches.get(0);
        }

        // Burn the same hashing time for unknown emails
        if (!emailKnown) {
            passwordEncoder.matches(req.getPassword(), dummyHash);
        }

        loginLimiter.fail(email);
        throw new BadCredentialsException("Invalid email or password");
    }

    // Email + password registration, the email must have been OTP verified first
    public LoginResponse register(RegisterRequest req) {

        if (req.getPassword() == null || !req.getPassword().equals(req.getConfirmPassword())) {
            throw new IllegalArgumentException("Passwords do not match");
        }
        PasswordPolicy.require(req.getPassword(), req.getEmail());

        String email = Emails.normalize(req.getEmail());
        boolean associate = "ASSOCIATE".equalsIgnoreCase(req.getAccountType());
        String role = associate ? User.ASSOCIATE : User.ADVOCATE;

        // Registration is blocked until the OTP step has passed
        otpService.requireVerified(email);

        if (userRepo.existsByEmailAndRole(email, User.ADMIN)) {
            throw new IllegalArgumentException("Email already in use");
        }
        if (userRepo.existsByEmailAndRole(email, role)) {
            throw new IllegalArgumentException(associate
                    ? "An associate account already exists for this email"
                    : "An advocate account already exists for this email");
        }

        // Associates are linked to an advocate through the advocate's code
        User advocate = associate ? resolveAdvocate(email, req.getAdvocateCode()) : null;

        User user = User.builder()
                .name(req.getName())
                .email(email)
                .password(passwordEncoder.encode(req.getPassword()))
                .phone(req.getPhone().trim())
                .barNo(req.getBarNo())
                .specialization(com.internyay.util.Specializations.clean(req.getSpecialization()))
                .role(role)
                .advocate(advocate)
                .advocateCode(associate ? null : newCode())
                .active(true)
                .build();

        try {
            User saved = userRepo.save(user);
            otpService.consume(email);

            return completeLogin(userRepo.findById(saved.getId()).orElse(saved), Method.PASSWORD);
        } catch (DataIntegrityViolationException e) {
            throw new IllegalArgumentException(associate
                    ? "An associate account already exists for this email"
                    : "An advocate account already exists for this email");
        }
    }

    // Validates the advocate code, blocks self linking and checks the plan's associate limit
    private User resolveAdvocate(String associateEmail, String rawCode) {

        String code = normaliseCode(rawCode);
        if (code.isEmpty()) {
            throw new IllegalArgumentException("Advocate code is required for an associate account");
        }

        User advocate = userRepo.findByAdvocateCode(code)
                .filter(a -> a.isAdvocate() && !Boolean.FALSE.equals(a.getActive()))
                .orElseThrow(() -> new IllegalArgumentException("Invalid advocate code"));

        if (advocate.getEmail().equalsIgnoreCase(associateEmail)) {
            throw new IllegalArgumentException(
                    "An associate account cannot be linked to your own advocate account");
        }
        planService.assertAssociateSeat(advocate);
        return advocate;
    }

    // Sign in with Google, the account must already exist
    public LoginResponse googleLogin(GoogleLoginRequest req) {

        GoogleTokenVerifier.GoogleIdentity google = googleVerifier.verify(req.getIdToken());
        String email = Emails.normalize(google.email());
        String type  = req.getAccountType() == null ? "" : req.getAccountType().trim().toUpperCase();

        List<String> roles = switch (type) {
            case "ADVOCATE"  -> List.of(User.ADVOCATE);
            case "ASSOCIATE" -> List.of(User.ASSOCIATE);
            case ""          -> List.of(User.ADVOCATE, User.ASSOCIATE);
            default          -> throw new IllegalArgumentException("Google sign-in is not available for that account type");
        };

        List<User> found = new java.util.ArrayList<>();
        for (String role : roles) {
            userRepo.findByEmailAndRole(email, role).ifPresent(found::add);
        }

        // The same Google email has both an advocate and an associate account and no type was chosen: ask, never guess
        if (found.size() > 1) {
            throw new IllegalArgumentException(CHOOSE_ACCOUNT_MESSAGE);
        }

        if (found.isEmpty()) {
            loginLog.failure(Method.GOOGLE, null, email, type, "No account for this Google email");
            // Point the user to the other account type when the email only has that one
            boolean wantsAdvocate  = "ADVOCATE".equals(type);
            boolean wantsAssociate = "ASSOCIATE".equals(type);
            if (wantsAdvocate && userRepo.existsByEmailAndRole(email, User.ASSOCIATE)) {
                throw new NoSuchElementException(
                        email + " has an associate account, not an advocate account — choose Associate to sign in");
            }
            if (wantsAssociate && userRepo.existsByEmailAndRole(email, User.ADVOCATE)) {
                throw new NoSuchElementException(
                        email + " has an advocate account, not an associate account — choose Advocate to sign in");
            }
            throw new NoSuchElementException(
                    "No InterNyay account uses " + email + " yet — open the Register tab to create one");
        }

        User user = found.get(0);

        // First Google login links the Google id to the account
        linkGoogleIdentity(user, google);
        return completeLogin(user, Method.GOOGLE);
    }

    // Create an account from Google, name and email come from the verified token
    public LoginResponse googleRegister(GoogleRegisterRequest req) {

        GoogleTokenVerifier.GoogleIdentity google = googleVerifier.verify(req.getIdToken());
        String email = Emails.normalize(google.email());

        boolean associate = "ASSOCIATE".equalsIgnoreCase(req.getAccountType());
        String role = associate ? User.ASSOCIATE : User.ADVOCATE;

        if (userRepo.existsByEmailAndRole(email, User.ADMIN)) {
            throw new IllegalArgumentException("Email already in use");
        }
        // Already registered with this Google email: open that account instead of refusing
        User existing = userRepo.findByEmailAndRole(email, role).orElse(null);
        if (existing != null) {
            return signInExisting(existing, google);
        }

        // Google does not share a phone number, so a new account must send one (the app asks for it in a popup).
        // Checked before the advocate code so the popup can ask for both at once
        if (req.getPhone() == null || req.getPhone().isBlank()) {
            throw new IllegalArgumentException(PHONE_REQUIRED_MESSAGE);
        }

        User advocate = associate ? resolveAdvocate(email, req.getAdvocateCode()) : null;

        User user = User.builder()
                .name(google.name())
                .email(email)
                // Google accounts get a random password the user never sees until they set one
                .password(passwordEncoder.encode(unguessableSecret()))
                .passwordSet(false)
                .googleId(google.subject())
                .phone(req.getPhone().trim())
                .barNo(req.getBarNo())
                .specialization(associate ? null : com.internyay.util.Specializations.clean(req.getSpecialization()))
                .role(role)
                .advocate(advocate)
                .advocateCode(associate ? null : newCode())
                .active(true)
                .build();

        try {
            return completeLogin(userRepo.save(user), Method.GOOGLE);
        } catch (DataIntegrityViolationException e) {
            // Two sign-ups raced each other: the account exists now, so open it
            User raced = userRepo.findByEmailAndRole(email, role).orElse(null);
            if (raced != null) {
                return signInExisting(raced, google);
            }
            throw new IllegalArgumentException(associate
                    ? "An associate account already exists for this email — sign in instead"
                    : "An advocate account already exists for this email — sign in instead");
        }
    }

    // Signs the user in to the account that already uses this Google email, and flags it so the app skips the new account steps
    private LoginResponse signInExisting(User user, GoogleTokenVerifier.GoogleIdentity google) {
        linkGoogleIdentity(user, google);
        LoginResponse res = completeLogin(user, Method.GOOGLE);
        res.setExistingAccount(true);
        return res;
    }

    // An account can only ever be tied to one Google identity
    private void linkGoogleIdentity(User user, GoogleTokenVerifier.GoogleIdentity google) {

        if (user.getGoogleId() == null || user.getGoogleId().isBlank()) {
            user.setGoogleId(google.subject());
            return;
        }
        if (!user.getGoogleId().equals(google.subject())) {
            throw new IllegalArgumentException("This account is linked to a different Google account");
        }
    }

    // 32 random bytes, URL-safe base64
    private String unguessableSecret() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    // Current user, also makes sure advocates have a code
    public UserDto me(Long accountId) {
        User user = userRepo.findById(accountId).orElseThrow();
        ensureAdvocateCode(user);
        return UserDto.fromSelf(user, qrCodeService.resolve(user.getQrCodeId()));
    }

    // Only fields that were sent are changed
    public UserDto updateProfile(Long accountId, UpdateProfileRequest req) {

        User user = userRepo.findById(accountId).orElseThrow();

        if (req.getName()           != null) user.setName(req.getName());
        if (req.getPhone()          != null) user.setPhone(req.getPhone());
        if (req.getBarNo()          != null) user.setBarNo(req.getBarNo());
        if (req.getSpecialization() != null) user.setSpecialization(com.internyay.util.Specializations.clean(req.getSpecialization()));
        if (req.getChamber()        != null) user.setChamber(req.getChamber());
        if (req.getProfilePicture() != null) user.setProfilePicture(ProfileImages.check(req.getProfilePicture()));
        if (req.getUpiId()          != null) user.setUpiId(req.getUpiId());
        // Payment QR image is stored separately, an empty value removes it
        if (req.getQrImage()        != null) {
            user.setQrCodeId(req.getQrImage().isBlank()
                    ? null
                    : qrCodeService.store(user.getId(), req.getQrImage()));
        }

        // Changing the password needs the current one
        if (req.getPassword() != null && !req.getPassword().isBlank()) {

            if (!user.hasPassword()) throw new IllegalArgumentException(User.NO_PASSWORD_MESSAGE);

            String oldPassword = req.getOldPassword();
            if (oldPassword == null || oldPassword.isBlank()
                    || !passwordEncoder.matches(oldPassword, user.getPassword())) {
                throw new IllegalArgumentException("Current password is incorrect");
            }

            PasswordPolicy.require(req.getPassword(), user.getEmail());
            user.setPassword(passwordEncoder.encode(req.getPassword()));
            user.setPasswordChangedAt(java.time.LocalDateTime.now());
        }

        User saved = userRepo.save(user);
        return UserDto.fromSelf(saved, qrCodeService.resolve(saved.getQrCodeId()));
    }

    // Sets the first password on a Google sign-up, only allowed while the account has no password yet
    public UserDto setInitialPassword(Long accountId, SetPasswordRequest req) {

        User user = userRepo.findById(accountId)
                .orElseThrow(() -> new NoSuchElementException("Account not found"));

        if (user.hasPassword()) {
            throw new IllegalArgumentException("This account already has a password. Use Change Password instead.");
        }

        PasswordPolicy.require(req.getPassword(), user.getEmail());

        if (!req.getPassword().equals(req.getConfirmPassword())) {
            throw new IllegalArgumentException("Passwords do not match");
        }

        user.setPassword(passwordEncoder.encode(req.getPassword()));
        user.setPasswordSet(true);
        user.setPasswordChangedAt(java.time.LocalDateTime.now());

        User saved = userRepo.save(user);
        return UserDto.fromSelf(saved, qrCodeService.resolve(saved.getQrCodeId()));
    }

    // Self deactivation, the account can be reactivated by logging in
    @Transactional
    public void deactivateAccount(Long accountId, String password) {

        User user = confirmedSelfServiceAccount(accountId, password);

        user.setActive(false);
        user.setSelfDeactivated(true);
        userRepo.save(user);
    }

    // Associates are removed on their own, advocates are purged with all their data
    @Transactional
    public void deleteAccount(Long accountId, String password) {

        User user = confirmedSelfServiceAccount(accountId, password);

        if (user.isAssociate()) {
            qrCodeService.deleteForUser(user.getId());
            userRepo.delete(user);
            return;
        }

        accountPurgeService.purge(user);
    }

    // Shared checks for deactivate/delete: admin accounts are excluded and the password must match
    private User confirmedSelfServiceAccount(Long accountId, String password) {

        User user = userRepo.findById(accountId)
                .orElseThrow(() -> new NoSuchElementException("Account not found"));

        if (user.isAdmin()) {
            throw new IllegalArgumentException(
                    "Administrator accounts cannot be deactivated or deleted from the profile page");
        }

        if (!user.hasPassword()) throw new IllegalArgumentException(User.NO_PASSWORD_MESSAGE);

        if (password == null || !passwordEncoder.matches(password, user.getPassword())) {
            throw new IllegalArgumentException("Incorrect password");
        }

        return user;
    }

    // Associates linked to an advocate
    @Transactional(readOnly = true)
    public List<AssociateDto> associatesOf(Long advocateId) {
        return userRepo.findByAdvocate_IdOrderByCreatedAtDesc(advocateId).stream()
                .map(a -> AssociateDto.from(a, qrCodeService.resolve(a.getQrCodeId())))
                .toList();
    }

    // Only removes associates that belong to this advocate
    @Transactional
    public void removeAssociate(Long advocateId, Long associateId) {

        User associate = userRepo.findById(associateId)
                .filter(u -> u.isAssociate()
                        && u.getAdvocate() != null
                        && u.getAdvocate().getId().equals(advocateId))
                .orElseThrow(() -> new NoSuchElementException("Associate not found"));

        qrCodeService.deleteForUser(associate.getId());
        userRepo.delete(associate);
    }

    // An advocate without a code (for example after an admin changes the role) gets one generated
    public void ensureAdvocateCode(User user) {
        if (user.isAdvocate() && (user.getAdvocateCode() == null || user.getAdvocateCode().isBlank())) {
            user.setAdvocateCode(newCode());
            userRepo.save(user);
        }
    }

    // Random code from the allowed alphabet, retried until unused
    private String newCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
            }
            String code = sb.toString();
            if (!userRepo.existsByAdvocateCode(code)) return code;
        }
        throw new IllegalStateException("Could not generate a unique advocate code — please try again");
    }

    // Upper case and drop spaces or dashes so typed codes still match
    static String normaliseCode(String raw) {
        return raw == null ? "" : raw.toUpperCase().replaceAll("[^A-Z0-9]", "");
    }
}
