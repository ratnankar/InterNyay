package com.internyay.repository;

import com.internyay.entity.CorporateSheet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;

public interface CorporateSheetRepository extends JpaRepository<CorporateSheet, Long> {

    List<CorporateSheet> findByFirmId(Long firmId);

    void deleteByFirmId(Long firmId);

    // File names without loading anything else
    @Query("SELECT s.id, s.fileName FROM CorporateSheet s WHERE s.id IN :ids")
    List<Object[]> namesOf(Collection<Long> ids);
}
