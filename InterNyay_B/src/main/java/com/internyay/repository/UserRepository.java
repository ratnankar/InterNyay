package com.internyay.repository;

import com.internyay.entity.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

// Advocates, associates and the admin
public interface UserRepository extends JpaRepository<User, Long> {

    // Same email can exist under different roles, so both are used
    Optional<User> findByEmailAndRole(String email, String role);
    // Checks if an account already exists for the email and role
    boolean existsByEmailAndRole(String email, String role);
    // True when at least one account has the role, used to make admin setup one-time
    boolean existsByRole(String role);

    // Locks the row so two requests can't change the same user at the same time
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.id = :id")
    Optional<User> findByIdForUpdate(Long id);

    // Finds an advocate from the code shared with associates
    Optional<User> findByAdvocateCode(String advocateCode);
    // Used when generating a new unique code
    boolean existsByAdvocateCode(String advocateCode);

    // Associates of an advocate, latest first
    List<User> findByAdvocate_IdOrderByCreatedAtDesc(Long advocateId);

    // Number of associates, checked against the plan limit
    long countByAdvocate_Id(Long advocateId);

    // Advocate accounts on a plan. Accounts with no plan code count as FREE
    @Query("SELECT u FROM User u WHERE u.role = 'ADVOCATE' AND (UPPER(u.planCode) = :code "
            + "OR (:isFree = true AND (u.planCode IS NULL OR u.planCode = '')))")
    List<User> findAdvocatesOnPlan(String code, boolean isFree);

    // How many advocate accounts are on a plan (accounts with no plan code count as FREE)
    @Query("SELECT COUNT(u) FROM User u WHERE u.role = 'ADVOCATE' AND (UPPER(u.planCode) = :code "
            + "OR (:isFree = true AND (u.planCode IS NULL OR u.planCode = '')))")
    long countAdvocatesOnPlan(String code, boolean isFree);

    // Every account that still carries a plan code (any role)
    List<User> findByPlanCodeIgnoreCase(String planCode);
}
