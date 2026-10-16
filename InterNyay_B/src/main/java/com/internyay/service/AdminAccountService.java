package com.internyay.service;

import com.internyay.entity.User;
import com.internyay.repository.UserRepository;
import com.internyay.util.Emails;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.NoSuchElementException;

// The one place where an account becomes an ADMIN. Used by the setup-key
// endpoint and the admin console, so the rules are identical everywhere
@Service
@RequiredArgsConstructor
@Slf4j
public class AdminAccountService {

    private final UserRepository userRepo;

    // Promotes the advocate account registered with this email
    @Transactional
    public User promoteByEmail(String rawEmail) {

        String email = Emails.normalize(rawEmail);
        if (email.isEmpty()) throw new IllegalArgumentException("Email is required");

        // Already an admin, nothing to change
        var existingAdmin = userRepo.findByEmailAndRole(email, User.ADMIN);
        if (existingAdmin.isPresent()) return existingAdmin.get();

        User advocate = userRepo.findByEmailAndRole(email, User.ADVOCATE)
                .orElseThrow(() -> new NoSuchElementException(
                        "No advocate account is registered with " + email + " — register it first"));

        return promote(advocate);
    }

    // Promotes an advocate account by id
    @Transactional
    public User promoteById(Long id) {

        User user = userRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("User not found"));

        if (user.isAdmin()) return user;
        return promote(user);
    }

    // Only advocate accounts can be promoted, an associate belongs to an advocate's practice
    private User promote(User user) {

        if (!user.isAdvocate()) {
            throw new IllegalArgumentException("Only an advocate account can be promoted to administrator");
        }
        // The same email can hold one account per role, so an existing admin row would clash
        if (userRepo.existsByEmailAndRole(user.getEmail(), User.ADMIN)) {
            throw new IllegalArgumentException("An administrator account already exists for this email");
        }

        // An admin does not belong to any advocate code
        user.setRole(User.ADMIN);
        user.setActive(true);
        user.setSelfDeactivated(false);
        user.setAdvocateCode(null);

        User saved = userRepo.save(user);
        log.info("Account {} ({}) promoted to ADMIN", saved.getId(), saved.getEmail());
        return saved;
    }
}
