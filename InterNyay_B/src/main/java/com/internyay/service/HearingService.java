package com.interNyay.service;

import com.interNyay.entity.Hearing;
import com.interNyay.repository.HearingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class HearingService {

    private final HearingRepository hearingRepository;
    private final ScrapingService scrapingService;   // <-- NEW

    @Transactional
    public Hearing update(Long id, Hearing updated) {
        Hearing existing = hearingRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Hearing not found: " + id));

        // apply whatever fields the caller set on `updated`
        existing.setHearingDate(updated.getHearingDate());
        existing.setPurpose(updated.getPurpose());
        // ...other fields as before...

        // NEW: auto-populate order number for the (new) hearing date
        if (existing.getHearingDate() != null && existing.getCnr() != null) {
            scrapingService
                    .findOrderForDate(existing.getCnr(), existing.getHearingDate())
                    .ifPresentOrElse(
                            existing::setOrderNumber,
                            () -> existing.setOrderNumber(null)   // no order → clear
                    );
        }

        return hearingRepository.save(existing);
    }
}