package com.internyay.repository;

import com.internyay.entity.EcourtsImport;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

// The saved "Import from eCourts" list of an account
public interface EcourtsImportRepository extends JpaRepository<EcourtsImport, Long> {

    Optional<EcourtsImport> findByAccountId(Long accountId);

    void deleteByAccountId(Long accountId);
}
