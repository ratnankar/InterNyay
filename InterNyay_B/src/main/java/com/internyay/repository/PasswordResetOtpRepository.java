package com.internyay.repository;

import com.internyay.entity.PasswordResetOtp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

// OTPs sent for forgot password
public interface PasswordResetOtpRepository extends JpaRepository<PasswordResetOtp, Long> {

    // Pending OTP of an account
    Optional<PasswordResetOtp> findByEmailAndRole(String email, String role);

    // Removes the OTP after it is used or replaced
    void deleteByEmailAndRole(String email, String role);
}
