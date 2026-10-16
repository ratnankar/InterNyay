package com.internyay.service;

import com.internyay.dto.*;
import com.internyay.entity.User;
import com.internyay.repository.*;
import com.internyay.util.Emails;
import com.internyay.util.PasswordPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.security.SecureRandom;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

// Business logic behind the admin console: stats and advocate account management
@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserRepository userRepo;
    private final PlanService planService;
    private final CaseRepository caseRepo;
    private final ClientRepository clientRepo;
    private final JudgeRepository judgeRepo;
    private final JudgeOnLeaveRepository judgeOnLeaveRepo;
    private final BailRosterRepository bailRosterRepo;
    private final DutyMagistrateRepository dutyMagistrateRepo;
    private final PoliceStationRepository policeStationRepo;
    private final AccountPurgeService accountPurgeService;
    private final PasswordEncoder passwordEncoder;
    private final QrCodeService qrCodeService;
    private final EmailService emailService;
    private final AdminAccountService adminAccounts;

    // Numbers for the admin overview cards and charts
    @Transactional(readOnly = true)
    public AdminStatsDto stats() {

        List<User> allUsers = userRepo.findAll();
        LocalDate today = LocalDate.now(IST);

        return AdminStatsDto.builder()
                .users(allUsers.size())
                .admins(allUsers.stream().filter(User::isAdmin).count())
                .associates(allUsers.stream().filter(User::isAssociate).count())
                .totalCases(caseRepo.count())
                .totalClients(clientRepo.count())
                .hearingsNext7Days(caseRepo.countByNextHearingBetween(today, today.plusDays(6)))
                .totalJudges(judgeRepo.countByActiveTrue())
                .judgesOnLeaveToday(judgeOnLeaveRepo.findOnLeaveToday(null, null, today).size())
                .totalBailRosterEntries(bailRosterRepo.count())
                .totalDutyMagistrateEntries(dutyMagistrateRepo.count())
                .totalPoliceStations(policeStationRepo.count())
                .casesByStatus(countsByLabel(caseRepo.countGroupedByStatus()))
                .casesByType(countsByLabel(caseRepo.countGroupedByType()))
                .casesByCourt(countsByLabel(caseRepo.countGroupedByCourt()))
                .monthly(lastSixMonths(today))
                .build();
    }

    // Dates for "today" and the monthly buckets follow court time
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    // New cases and clients per month for the last six months, including empty months
    private List<AdminStatsDto.Month> lastSixMonths(LocalDate today) {

        YearMonth thisMonth = YearMonth.from(today);
        YearMonth first = thisMonth.minusMonths(5);
        LocalDateTime from = first.atDay(1).atStartOfDay();

        Map<YearMonth, Long> cases = caseRepo.createdSince(from).stream()
                .collect(Collectors.groupingBy(YearMonth::from, Collectors.counting()));
        Map<YearMonth, Long> clients = clientRepo.createdSince(from).stream()
                .collect(Collectors.groupingBy(YearMonth::from, Collectors.counting()));

        List<AdminStatsDto.Month> months = new ArrayList<>();
        for (YearMonth m = first; !m.isAfter(thisMonth); m = m.plusMonths(1)) {
            months.add(new AdminStatsDto.Month(
                    m.toString(), cases.getOrDefault(m, 0L), clients.getOrDefault(m, 0L)));
        }
        return months;
    }

    // Merges grouped DB rows by label, blanks become "Unspecified", biggest first
    private static Map<String, Long> countsByLabel(List<Object[]> rows) {
        Map<String, Long> merged = new LinkedHashMap<>();
        for (Object[] row : rows) {
            String label = row[0] == null || row[0].toString().isBlank() ? "Unspecified" : row[0].toString().trim();
            merged.merge(label, ((Number) row[1]).longValue(), Long::sum);
        }
        return merged.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, Long::sum, LinkedHashMap::new));
    }

    // All accounts ordered by id
    @Transactional(readOnly = true)
    public List<UserDto> listUsers() {
        return userRepo.findAll().stream()
                .sorted(Comparator.comparing(User::getId))
                .map(u -> UserDto.from(u, qrCodeService.resolve(u.getQrCodeId())))
                .toList();
    }

    // Admin creates an advocate or admin account, email must be unique within the role
    public UserDto createUser(AdminUserRequest req) {

        if (req.getEmail() == null || req.getEmail().isBlank()) {
            throw new IllegalArgumentException("Email is required");
        }
        String newRole = normaliseRole(req.getRole());
        String email = Emails.normalize(req.getEmail());
        if (userRepo.existsByEmailAndRole(email, newRole)) {
            throw new IllegalArgumentException("Email already in use");
        }
        if (req.getPassword() == null || req.getPassword().isBlank()) {
            throw new IllegalArgumentException("Password is required");
        }
        PasswordPolicy.require(req.getPassword(), email);

        User user = User.builder()
                .name(req.getName() != null ? req.getName() : req.getEmail())
                .email(email)
                .password(passwordEncoder.encode(req.getPassword()))
                .phone(req.getPhone())
                .barNo(req.getBarNo())
                .specialization(com.internyay.util.Specializations.clean(req.getSpecialization()))
                .chamber(req.getChamber())
                .role(newRole)
                .planCode(resolvePlanCode(req.getPlanCode(), null))
                .associateLimit(User.ADVOCATE.equals(newRole) ? checkedAssociateLimit(req.getAssociateLimit()) : null)
                .active(req.getActive() == null || req.getActive())
                .build();

        User saved = userRepo.save(user);
        return UserDto.from(saved, qrCodeService.resolve(saved.getQrCodeId()));
    }

    // Admin can't edit their own account here, that goes through Profile
    public UserDto updateUser(Long id, AdminUserRequest req, Long currentAdminId) {

        if (id.equals(currentAdminId)) {
            throw new IllegalArgumentException(
                    "Edit your own account from your Profile page, not the admin console");
        }

        User user = userRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("User not found"));

        // Associates always stay associates, the role can only switch between advocate and admin
        String targetRole = user.isAssociate()
                ? User.ASSOCIATE
                : (req.getRole() != null ? normaliseRole(req.getRole()) : user.getRole());
        String targetEmail = req.getEmail() != null ? Emails.normalize(req.getEmail()) : user.getEmail();

        // Making an advocate an administrator needs the acting admin's own password
        boolean becomesAdmin = User.ADMIN.equals(targetRole) && !user.isAdmin();
        if (becomesAdmin) {
            requireAdminPassword(currentAdminId, req.getAdminPassword());
            if (!user.isAdvocate()) {
                throw new IllegalArgumentException("Only an advocate account can be promoted to administrator");
            }
        }

        // Only re-check email uniqueness when the email or role actually changed
        boolean identityChanged = !targetEmail.equalsIgnoreCase(user.getEmail())
                || !targetRole.equalsIgnoreCase(user.getRole());
        if (identityChanged && userRepo.existsByEmailAndRole(targetEmail, targetRole)) {
            throw new IllegalArgumentException("Email already in use");
        }

        if (req.getName()           != null) user.setName(req.getName());
        user.setEmail(targetEmail);
        if (req.getPhone()          != null) user.setPhone(req.getPhone());
        if (req.getBarNo()          != null) user.setBarNo(req.getBarNo());
        if (req.getSpecialization() != null) user.setSpecialization(com.internyay.util.Specializations.clean(req.getSpecialization()));
        if (req.getChamber()        != null) user.setChamber(req.getChamber());
        user.setRole(targetRole);
        // An admin does not belong to any advocate code
        if (User.ADMIN.equals(targetRole)) user.setAdvocateCode(null);
        if (req.getPlanCode() != null && !req.getPlanCode().isBlank() && !user.isAssociate()) {
            user.setPlanCode(resolvePlanCode(req.getPlanCode(), user.getPlanCode()));
        }
        // Associate limit: an admin-set number overrides the plan, clearing it hands control back to the plan
        if (user.isAdvocate() && User.ADVOCATE.equals(targetRole)) {
            if (Boolean.TRUE.equals(req.getClearAssociateLimit())) {
                user.setAssociateLimit(null);
            } else if (req.getAssociateLimit() != null) {
                int newLimit = checkedAssociateLimit(req.getAssociateLimit());
                long used = userRepo.countByAdvocate_Id(user.getId());
                if (newLimit >= 0 && used > newLimit) {
                    throw new IllegalArgumentException("This advocate already has " + used
                            + " associates. Remove some first, or set the limit to " + used + " or more");
                }
                user.setAssociateLimit(newLimit);
            }
        } else {
            // Admins and associates have no associate limit
            user.setAssociateLimit(null);
        }
        // Reactivating or deactivating from admin clears the self-deactivated flag
        if (req.getActive() != null && !req.getActive().equals(user.getActive())) {
            user.setActive(req.getActive());
            user.setSelfDeactivated(false);
        }

        User saved = userRepo.save(user);
        return UserDto.from(saved, qrCodeService.resolve(saved.getQrCodeId()));
    }

    // -1 (unlimited) or a whole number from 0 up; null stays null (the plan's limit applies)
    private Integer checkedAssociateLimit(Integer value) {
        if (value == null) return null;
        if (value < -1 || value > 1000) {
            throw new IllegalArgumentException("Associate limit must be -1 (unlimited) or a number from 0 to 1000");
        }
        return value;
    }

    // Checks the acting admin's own password before a sensitive change
    private void requireAdminPassword(Long adminId, String password) {
        User admin = userRepo.findById(adminId)
                .orElseThrow(() -> new NoSuchElementException("Admin account not found"));
        if (!admin.hasPassword()) throw new IllegalArgumentException(User.NO_PASSWORD_MESSAGE);
        if (password == null || password.isBlank() || !passwordEncoder.matches(password, admin.getPassword())) {
            throw new IllegalArgumentException("Incorrect password");
        }
    }

    // Makes an advocate an administrator, after the acting admin re-enters their password
    public UserDto promoteToAdmin(Long id, String adminPassword, Long currentAdminId) {
        requireAdminPassword(currentAdminId, adminPassword);
        User saved = adminAccounts.promoteById(id);
        return UserDto.from(saved, qrCodeService.resolve(saved.getQrCodeId()));
    }

    // Plan code defaults to FREE and must exist. A coming soon plan or a business-only plan cannot be given to an
    // advocate account, except that an account already on it keeps it (so saving other fields never fails)
    private String resolvePlanCode(String raw, String currentCode) {
        if (raw == null || raw.isBlank()) return planService.defaultPlanCode();
        String code = raw.trim().toUpperCase();
        if (!planService.exists(code)) throw new IllegalArgumentException("Unknown plan");
        boolean unchanged = currentCode != null && currentCode.trim().equalsIgnoreCase(code);
        if (!unchanged && planService.isDisabled(code)) {
            throw new IllegalArgumentException("This plan is disabled and cannot be assigned");
        }
        if (!unchanged && planService.isComingSoon(code)) {
            throw new IllegalArgumentException("This plan is marked as coming soon and cannot be assigned yet");
        }
        if (!unchanged && planService.isBusinessOnly(code)) {
            throw new IllegalArgumentException(
                    "This plan is for business accounts only. Set it to Both in Pricing Plans to give it to an advocate");
        }
        return code;
    }

    // Characters without lookalikes (no 0/O, 1/l/I) for temporary passwords
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final String LOWER = "abcdefghijkmnopqrstuvwxyz";
    private static final String DIGITS = "23456789";
    private static final String SYMBOLS = "@#$%&*!?";

    // Sets a random temporary password and emails it, admin never sees it
    @Transactional
    public void resetPassword(Long id, Long currentAdminId) {

        if (id.equals(currentAdminId)) {
            throw new IllegalArgumentException(
                    "Change your own password from your Profile page, not the admin console");
        }

        User user = userRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("User not found"));

        if (user.getEmail() == null || user.getEmail().isBlank()) {
            throw new IllegalArgumentException("This account has no email address to send a password to");
        }

        String temp = generateTemporaryPassword();
        user.setPassword(passwordEncoder.encode(temp));
        user.setPasswordSet(true);
        user.setPasswordChangedAt(java.time.LocalDateTime.now());
        userRepo.save(user);

        emailService.sendTemporaryPassword(user.getEmail(), user.getName(), temp);
    }

    // 12 characters with at least one of each kind, shuffled
    private static String generateTemporaryPassword() {
        String all = UPPER + LOWER + DIGITS + SYMBOLS;
        List<Character> chars = new ArrayList<>();
        chars.add(pick(UPPER));
        chars.add(pick(LOWER));
        chars.add(pick(DIGITS));
        chars.add(pick(SYMBOLS));
        while (chars.size() < 12) chars.add(pick(all));

        java.util.Collections.shuffle(chars, RANDOM);
        StringBuilder sb = new StringBuilder();
        chars.forEach(sb::append);
        return sb.toString();
    }

    // Random character from the given set
    private static char pick(String set) {
        return set.charAt(RANDOM.nextInt(set.length()));
    }

    // Removes the account and all its data, admins can't delete themselves
    @Transactional
    public void deleteUser(Long id, String adminPassword, Long currentAdminId) {

        if (id.equals(currentAdminId)) {
            throw new IllegalArgumentException("You cannot delete your own admin account");
        }

        // Deleting an account is permanent, so the acting admin must re-enter their own password
        requireAdminPassword(currentAdminId, adminPassword);

        User user = userRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("User not found"));

        accountPurgeService.purge(user);
    }

    // Only ADVOCATE or ADMIN can be assigned from the console
    private String normaliseRole(String role) {
        if (role == null || role.isBlank()) return User.ADVOCATE;
        return User.ADMIN.equalsIgnoreCase(role) ? User.ADMIN : User.ADVOCATE;
    }
}
