package com.internyay.repository;

import com.internyay.entity.Hearing;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

// Hearings of a case, entered by the advocate
public interface HearingRepository extends JpaRepository<Hearing, Long> {

    // Removes every hearing of a user
    void deleteByUser_Id(Long userId);

    // Removes the hearings when a case is deleted
    void deleteByLegalCase_Id(Long caseId);

    // Hearing list with case and date range filters
    @Query("""
        SELECT h FROM Hearing h
        WHERE h.user.id = :userId
        AND (:caseId IS NULL OR h.legalCase.id = :caseId)
        AND (:from IS NULL OR h.date >= :from)
        AND (:to IS NULL OR h.date <= :to)
        """)
    Page<Hearing> findByFilters(Long userId, Long caseId,
                                LocalDate from, LocalDate to, Pageable pageable);

    // Hearings of one case, latest first
    List<Hearing> findByLegalCase_IdAndUser_IdOrderByDateDesc(Long caseId, Long userId);

    // Hearings of a day along with their case in one query
    @Query("""
        SELECT h FROM Hearing h JOIN FETCH h.legalCase
        WHERE h.user.id = :userId AND h.date = :date
        """)
    List<Hearing> findWithCaseByUserAndDate(Long userId, LocalDate date);

    // One hearing with its case (and the case's court row) loaded, so no lazy loading is needed afterwards
    @Query("""
        SELECT h FROM Hearing h
        JOIN FETCH h.legalCase c
        JOIN FETCH c.courtPlace
        WHERE h.id = :id
        """)
    Optional<Hearing> findWithCaseById(Long id);

    // Hearings of a case that have an order, in date order, used to number the orders
    @Query("""
        SELECT h FROM Hearing h
        WHERE h.legalCase.id = :caseId AND h.user.id = :userId AND h.orderDocId IS NOT NULL
        ORDER BY h.date ASC, h.id ASC
        """)
    List<Hearing> findWithOrdersInDateOrder(Long caseId, Long userId);

    // Hearing of a case on a given date
    Optional<Hearing> findByLegalCase_IdAndUser_IdAndDate(Long caseId, Long userId, LocalDate date);

    // Removes the order link from hearings when the order document is deleted
    @Transactional
    @Modifying
    @Query("UPDATE Hearing h SET h.orderDocId = null, h.orderDocName = null, h.orderSeq = null WHERE h.orderDocId = :docId")
    int clearOrderDoc(String docId);
}
