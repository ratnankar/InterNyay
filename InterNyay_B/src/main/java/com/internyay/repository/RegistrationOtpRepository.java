package com.internyay.repository;

import com.internyay.entity.RegistrationOtp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

// OTPs sent to verify an email during registration
public interface RegistrationOtpRepository extends JpaRepository<RegistrationOtp, Long> {

    // Pending OTP of an email
    Optional<RegistrationOtp> findByEmail(String email);

    // Removes the OTP after it is used or replaced
    void deleteByEmail(String email);
}
