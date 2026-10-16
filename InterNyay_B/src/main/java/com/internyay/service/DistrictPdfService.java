package com.internyay.service;

import com.internyay.entity.DistrictPdf;
import com.internyay.entity.RosterSection;
import com.internyay.repository.DistrictPdfRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;

// One PDF per section and district, files live in file storage
@Service
@RequiredArgsConstructor
public class DistrictPdfService {

    private final CourtService courtService;

    private final DistrictPdfRepository repo;
    private final PdfStorageService pdfStorage;

    // All PDFs or only those of one section
    public List<DistrictPdf> list(String section) {
        if (section == null || section.isBlank()) {
            return repo.findAllByOrderBySectionAscCourtAscDistrictAsc();
        }
        return repo.findBySectionOrderByCourtAscDistrictAsc(RosterSection.parse(section));
    }

    // PDF record for a section and district
    public DistrictPdf get(String section, String district) {
        RosterSection sec = RosterSection.parse(section);
        String canonicalDistrict = courtService.requireDistrict(district);

        return repo.findBySectionAndDistrict(sec, canonicalDistrict)
                .orElseThrow(() -> new NoSuchElementException("No PDF has been uploaded for " + canonicalDistrict));
    }

    // Open the stored file, the caller closes the stream
    public InputStream pdf(String section, String district) {
        return pdfStorage.open(get(section, district).getPdfStorageKey());
    }

    // Upload or replace, the old file is released if nothing else uses it
    public DistrictPdf save(String section, String district, MultipartFile file) throws IOException {
        RosterSection sec = RosterSection.parse(section);
        String canonicalDistrict = courtService.requireDistrict(district);
        String court = courtService.courtOf(canonicalDistrict).orElseThrow();

        PdfStorageService.StoredPdf stored = pdfStorage.store(file);

        DistrictPdf entry = repo.findBySectionAndDistrict(sec, canonicalDistrict).orElse(null);
        String oldStorageKey = null;

        if (entry == null) {
            entry = new DistrictPdf();
            entry.setSection(sec);
            entry.setCourt(court);
            entry.setDistrict(canonicalDistrict);
            entry.setCreatedAt(LocalDateTime.now());
        } else {
            oldStorageKey = entry.getPdfStorageKey();
            entry.setUpdatedAt(LocalDateTime.now());
        }

        entry.setPdfStorageKey(stored.storageKey());
        entry.setPdfFileName(stored.fileName());
        entry.setPdfSizeBytes(stored.sizeBytes());

        DistrictPdf saved;
        try {
            saved = repo.save(entry);
        } catch (RuntimeException e) {
            // The record was not saved, so the new file would be left behind
            pdfStorage.delete(stored.storageKey());
            throw e;
        }
        release(oldStorageKey);
        return saved;
    }

    // Delete the record and its file
    public void delete(String section, String district) {
        DistrictPdf entry = get(section, district);
        String storageKey = entry.getPdfStorageKey();
        repo.delete(entry);
        release(storageKey);
    }

    // A stored file is deleted only when no record points to it any more
    private void release(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) return;
        if (repo.countByPdfStorageKey(storageKey) == 0) {
            pdfStorage.delete(storageKey);
        }
    }
}
