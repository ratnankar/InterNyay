package com.internyay.repository;

import com.internyay.entity.EmailChangeOtp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

// OTPs sent when a user changes their email
public interface EmailChangeOtpRepository extends JpaRepository<EmailChangeOtp, Long> {

    // Pending OTP of a user
    Optional<EmailChangeOtp> findByAccountId(Long accountId);

    // Removes the OTP after it is used or replaced
    void deleteByAccountId(Long accountId);
}
