package com.internyay.repository;

import com.internyay.entity.DocumentMeta;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

// Document details stored in MySQL, the files are in file storage
public interface DocumentRepository extends JpaRepository<DocumentMeta, String> {

    // Documents of a case, latest first
    List<DocumentMeta> findByCaseIdOrderByUploadedAtDesc(Long caseId);

    // Documents of a client, latest first
    List<DocumentMeta> findByClientIdOrderByUploadedAtDesc(Long clientId);

    // All documents of a user, latest first
    List<DocumentMeta> findByUserIdOrderByUploadedAtDesc(Long userId);

    // Documents of many cases
    List<DocumentMeta> findByCaseIdIn(Collection<Long> caseIds);

    // Documents not linked to any case or client
    List<DocumentMeta> findByUserIdAndCaseIdIsNullAndClientIdIsNullOrderByUploadedAtDesc(Long userId);
}
