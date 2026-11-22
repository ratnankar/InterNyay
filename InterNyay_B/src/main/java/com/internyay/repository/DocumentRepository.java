package com.internyay.repository;

import com.internyay.entity.DocumentMeta;
import org.springframework.data.jpa.repository.JpaRepository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

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

    // Documents of a misc. application, oldest first
    List<DocumentMeta> findByMiscApplicationIdOrderByUploadedAtAsc(Long miscApplicationId);

    // Documents of many misc. applications
    List<DocumentMeta> findByMiscApplicationIdIn(Collection<Long> miscApplicationIds);

    // Documents not linked to any case or client
    List<DocumentMeta> findByUserIdAndCaseIdIsNullAndClientIdIsNullOrderByUploadedAtDesc(Long userId);

    Optional<DocumentMeta> findByUserIdAndClientUploadId(Long userId, String clientUploadId);

    @Query("""
            select d from DocumentMeta d
            where d.userId = :userId
              and d.source = 'MOBILE_SCAN'
              and (:caseId is null or d.caseId = :caseId)
              and (:clientId is null or d.clientId = :clientId)
              and (:docType is null or d.type = :docType)
              and (:fromAt is null or d.uploadedAt >= :fromAt)
              and (:toAt is null or d.uploadedAt < :toAt)
              and (:pattern is null or lower(d.name) like :pattern
                   or exists (select 1 from DocumentText t where t.documentId = d.id and lower(t.text) like :pattern))
            """)
    Page<DocumentMeta> searchScans(@Param("userId") Long userId,
                                   @Param("pattern") String pattern,
                                   @Param("caseId") Long caseId,
                                   @Param("clientId") Long clientId,
                                   @Param("docType") String docType,
                                   @Param("fromAt") LocalDateTime fromAt,
                                   @Param("toAt") LocalDateTime toAt,
                                   Pageable pageable);
}
