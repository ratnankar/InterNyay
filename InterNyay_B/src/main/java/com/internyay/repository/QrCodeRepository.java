package com.internyay.repository;

import com.internyay.entity.QrCode;
import org.springframework.data.jpa.repository.JpaRepository;

// Payment QR codes stored in MySQL
public interface QrCodeRepository extends JpaRepository<QrCode, String> {

    // Removes the QR codes of a user (call it inside a transaction)
    void deleteByUserId(Long userId);
}
