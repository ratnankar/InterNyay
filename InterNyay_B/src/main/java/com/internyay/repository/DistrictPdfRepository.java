package com.internyay.repository;

import com.internyay.entity.DistrictPdf;
import com.internyay.entity.RosterSection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

// PDFs uploaded for each district under a Quick Access section
public interface DistrictPdfRepository extends JpaRepository<DistrictPdf, Long> {

    // PDF of a district in a section
    Optional<DistrictPdf> findBySectionAndDistrict(RosterSection section, String district);

    // PDFs of one section
    List<DistrictPdf> findBySectionOrderByCourtAscDistrictAsc(RosterSection section);

    // All PDFs for the admin
    List<DistrictPdf> findAllByOrderBySectionAscCourtAscDistrictAsc();

    // How many records use a stored file, so it is deleted only when unused
    long countByPdfStorageKey(String pdfStorageKey);
}
