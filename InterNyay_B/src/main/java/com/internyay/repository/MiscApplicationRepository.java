package com.internyay.repository;

import com.internyay.entity.MiscApplication;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

// Misc. applications of the advocates
public interface MiscApplicationRepository extends JpaRepository<MiscApplication, Long> {

    // Removes the applications when a case is deleted
    void deleteByLegalCase_Id(Long caseId);

    // Applications of one case, newest first
    List<MiscApplication> findByLegalCase_IdAndUser_IdOrderByCreatedAtDesc(Long caseId, Long userId);

    // Filterable list with the case, its court and its client loaded in the same query. The search matches the
    // application type, the case title and number, and the client's name
    @Query(value = """
        SELECT a FROM MiscApplication a
        JOIN FETCH a.legalCase c
        JOIN FETCH c.courtPlace
        JOIN FETCH c.client cl
        WHERE a.user.id = :userId
        AND (:status IS NULL OR a.status = :status)
        AND (:caseId IS NULL OR c.id = :caseId)
        AND (:search IS NULL
             OR LOWER(a.applicationType) LIKE LOWER(CONCAT('%', :search, '%'))
             OR LOWER(c.title) LIKE LOWER(CONCAT('%', :search, '%'))
             OR LOWER(c.caseNo) LIKE LOWER(CONCAT('%', :search, '%'))
             OR LOWER(cl.name) LIKE LOWER(CONCAT('%', :search, '%')))
        """,
        countQuery = """
        SELECT COUNT(a) FROM MiscApplication a
        JOIN a.legalCase c
        JOIN c.client cl
        WHERE a.user.id = :userId
        AND (:status IS NULL OR a.status = :status)
        AND (:caseId IS NULL OR c.id = :caseId)
        AND (:search IS NULL
             OR LOWER(a.applicationType) LIKE LOWER(CONCAT('%', :search, '%'))
             OR LOWER(c.title) LIKE LOWER(CONCAT('%', :search, '%'))
             OR LOWER(c.caseNo) LIKE LOWER(CONCAT('%', :search, '%'))
             OR LOWER(cl.name) LIKE LOWER(CONCAT('%', :search, '%')))
        """)
    Page<MiscApplication> findByFilters(Long userId, String status, Long caseId, String search, Pageable pageable);

    // One application with its case, court and client loaded
    @Query("""
        SELECT a FROM MiscApplication a
        JOIN FETCH a.legalCase c
        JOIN FETCH c.courtPlace
        JOIN FETCH c.client
        WHERE a.id = :id
        """)
    java.util.Optional<MiscApplication> findWithCaseById(Long id);
}
