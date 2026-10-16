package com.internyay.service;

import com.internyay.entity.QrCode;
import com.internyay.repository.QrCodeRepository;
import com.internyay.util.ProfileImages;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// Payment QR images are kept in their own table instead of on the user row
@Service
@RequiredArgsConstructor
public class QrCodeService {

    private final QrCodeRepository repo;

    // Save an image and return its id. Only an image data URL under the size limit is accepted
    public String store(Long userId, String dataUrl) {
        if (dataUrl == null || dataUrl.isBlank()) return null;
        ProfileImages.check(dataUrl);
        QrCode saved = repo.save(QrCode.builder().userId(userId).image(dataUrl).build());
        return saved.getId();
    }

    // Image for an id
    public String resolve(String qrCodeId) {
        if (qrCodeId == null || qrCodeId.isBlank()) return null;
        return repo.findById(qrCodeId).map(QrCode::getImage).orElse(null);
    }

    // Remove a user's QR images
    @Transactional
    public void deleteForUser(Long userId) {
        if (userId == null) return;
        repo.deleteByUserId(userId);
    }
}
