package com.internyay.controller;

import com.internyay.entity.User;
import com.internyay.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

// Helpers to read the logged in account from the security context
@Component
@RequiredArgsConstructor
public class AuthHelper {

    private final UserRepository userRepo;

    // Id of the logged in account, taken from the token subject
    public Long currentAccountId() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        try {
            return Long.valueOf(a.getName());
        } catch (NumberFormatException | NullPointerException e) {
            throw new AccessDeniedException("Invalid session — please sign in again");
        }
    }

    // Full user row of the logged in account
    public User currentAccount() {
        return userRepo.findById(currentAccountId())
                .orElseThrow(() -> new RuntimeException("User not found"));
    }

    // Id used to scope data: an associate works on its advocate's data, everyone else on their own
    public Long currentUserId() {
        User me = currentAccount();
        if (me.isAssociate()) {
            if (me.getAdvocate() == null) {
                throw new AccessDeniedException("This associate account is not linked to an advocate");
            }
            return me.getAdvocate().getId();
        }
        return me.getId();
    }

    // True when the current token belongs to an associate
    public boolean isAssociate() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        return a != null && a.getAuthorities().stream()
                .anyMatch(g -> "ROLE_ASSOCIATE".equals(g.getAuthority()));
    }

    // Guard for actions that only advocates may do
    public void requireNotAssociate() {
        if (isAssociate()) {
            throw new AccessDeniedException("Associates cannot view or change fee and transaction details");
        }
    }
}
