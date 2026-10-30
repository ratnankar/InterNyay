package com.internyay.repository;

import com.internyay.entity.Case;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

// Cases of an advocate plus the queries used for file numbers, hearings and admin stats
public interface CaseRepository extends JpaRepository<Case, Long> {

    // Whether the advocate already has a case with this case number (deleted cases are hidden by @SQLRestriction)
    boolean existsByUser_IdAndCaseNoIgnoreCase(Long userId, String caseNo);

    // Whether the advocate already has a case with this CNR number (stored normalized; deleted cases are hidden)
    boolean existsByUser_IdAndCnrNoIgnoreCase(Long userId, String cnrNo);

    // Case list with search, status, nature and client filters
    @Query("""
        SELECT c FROM Case c
        WHERE c.user.id = :userId
        AND c.miscPortal = false
        AND (:search IS NULL OR LOWER(c.title) LIKE LOWER(CONCAT('%',:search,'%'))
             OR LOWER(c.caseNo) LIKE LOWER(CONCAT('%',:search,'%')))
        AND (:status IS NULL OR c.status = :status)
        AND (:type IS NULL OR c.caseNature = :type)
        AND (:clientId IS NULL OR c.client.id = :clientId
             OR EXISTS (SELECT 1 FROM c.additionalClients ac WHERE ac.id = :clientId))
        """)
    Page<Case> findByFilters(Long userId, String search, String status, String type,
                             Long clientId, Pageable pageable);

    // Every case of a user where the client is the main client or one of the additional clients
    @Query("""
        SELECT c FROM Case c
        WHERE c.user.id = :userId
        AND (c.client.id = :clientId
             OR EXISTS (SELECT 1 FROM c.additionalClients ac WHERE ac.id = :clientId))
        """)
    List<Case> findAllOfClient(Long userId, Long clientId);

    // All cases of one user
    List<Case> findByUser_Id(Long userId);

    // Removes every case of a user
    void deleteByUser_Id(Long userId);

    // Cases of a user that are listed on a date
    List<Case> findByUser_IdAndNextHearing(Long userId, LocalDate nextHearing);

    // Loads clients, user and court together: the reminder and cause list jobs run outside a session,
    // and an entity graph makes every attribute it does not list lazy, so the court must be named here
    @EntityGraph(attributePaths = {"client", "additionalClients", "user", "courtPlace"})
    List<Case> findByNextHearing(LocalDate nextHearing);

    // Just what the next hearing date update needs to know about a case
    interface HearingDateDue {
        Long getId();
        Long getUserId();
        String getCnrNo();
    }

    // Open cases of every advocate that still have this date as their next hearing and a CNR number: the hearing date
    // has not been moved on yet, so eCourts is asked for the new one. Decided and withdrawn cases are over, and
    // deleted ones are hidden by @SQLRestriction
    @Query("""
        SELECT c.id AS id, c.user.id AS userId, c.cnrNo AS cnrNo FROM Case c
        WHERE c.nextHearing = :date
        AND c.cnrNo IS NOT NULL AND TRIM(c.cnrNo) <> ''
        AND (c.status IS NULL OR c.status NOT IN ('Decided', 'Withdrawn'))
        ORDER BY c.id
        """)
    List<HearingDateDue> findOpenWithCnrListedOn(LocalDate date);

    // Saves the cause list number for many cases in one update
    @Transactional
    @Modifying
    @Query(value = "UPDATE cases SET listing_no = :causeListNo, listing_date = :listingDate WHERE id IN (:ids)",
            nativeQuery = true)
    int saveCauseListNo(Integer causeListNo, LocalDate listingDate, List<Long> ids);

    // Brings back all soft deleted cases of a user
    @Transactional
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "UPDATE cases SET deleted = 0 WHERE user_id = :userId AND deleted = 1", nativeQuery = true)
    int undeleteAllOfUser(Long userId);

    // Ids of deleted cases of a client, including cases where the client is an additional client
    @Query(value = """
        SELECT c.id FROM cases c
        WHERE c.deleted = 1
        AND (c.client_id = :clientId
             OR c.id IN (SELECT a.case_id FROM case_additional_clients a WHERE a.client_id = :clientId))
        """, nativeQuery = true)
    List<Long> deletedCaseIdsOfClient(Long clientId);

    // Number of open (not deleted) cases of a client, including cases where the client is an additional client
    @Query(value = """
        SELECT COUNT(*) FROM cases c
        WHERE (c.deleted IS NULL OR c.deleted = 0)
        AND (c.client_id = :clientId
             OR c.id IN (SELECT a.case_id FROM case_additional_clients a WHERE a.client_id = :clientId))
        """, nativeQuery = true)
    long countLiveCasesOfClient(Long clientId);

    // Brings back the given soft deleted cases
    @Transactional
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "UPDATE cases SET deleted = 0 WHERE id IN (:ids)", nativeQuery = true)
    int undelete(List<Long> ids);

    // File numbers used by open cases, a closed case frees its number
    @Query("""
        SELECT c.fileSeq FROM Case c
        WHERE c.user.id = :userId AND c.fileSeq IS NOT NULL
        AND (c.status IS NULL OR c.status NOT IN ('Decided', 'Withdrawn'))
        """)
    List<Integer> openFileSeqs(Long userId);

    // Highest file number among open cases
    @Query("""
        SELECT MAX(c.fileSeq) FROM Case c
        WHERE c.user.id = :userId
        AND (c.status IS NULL OR c.status NOT IN ('Decided', 'Withdrawn'))
        """)
    Integer maxOpenFileSeq(Long userId);

    // Highest file number ever used by the user
    @Query("SELECT MAX(c.fileSeq) FROM Case c WHERE c.user.id = :userId")
    Integer maxFileSeq(Long userId);

    // Closed cases that still hold a file number, latest first
    @Query("""
        SELECT c.fileSeq, c.title, c.caseNo FROM Case c
        WHERE c.user.id = :userId AND c.fileSeq IS NOT NULL AND c.status IN ('Decided', 'Withdrawn')
        ORDER BY c.updatedAt DESC
        """)
    List<Object[]> closedFileSeqs(Long userId);

    // How many other open cases hold this file number
    @Query("""
        SELECT COUNT(c) FROM Case c
        WHERE c.user.id = :userId AND c.fileSeq = :seq AND c.id <> :excludeId
        AND (c.status IS NULL OR c.status NOT IN ('Decided', 'Withdrawn'))
        """)
    long countOpenHolders(Long userId, Integer seq, Long excludeId);

    // Admin stats: cases per status
    @Query("SELECT c.status, COUNT(c) FROM Case c GROUP BY c.status")
    List<Object[]> countGroupedByStatus();

    // Admin stats: cases per nature
    @Query("SELECT c.caseNature, COUNT(c) FROM Case c GROUP BY c.caseNature")
    List<Object[]> countGroupedByType();

    // Admin stats: cases per court
    @Query("SELECT c.courtPlace.court, COUNT(c) FROM Case c GROUP BY c.courtPlace.court")
    List<Object[]> countGroupedByCourt();

    // Creation dates of cases from a date, for the growth chart
    @Query("SELECT c.createdAt FROM Case c WHERE c.createdAt >= :from")
    List<LocalDateTime> createdSince(LocalDateTime from);

    // Cases (not deleted) linked to any of the given court table rows, used before a court row is removed
    @Query(value = "SELECT COUNT(*) FROM cases WHERE court_id IN (:ids) AND (deleted IS NULL OR deleted = 0)", nativeQuery = true)
    long countActiveAtCourts(List<Long> ids);

    // Deleted cases still linked to those rows: they can be restored, so the rows must stay while they exist
    @Query(value = "SELECT COUNT(*) FROM cases WHERE court_id IN (:ids) AND deleted = 1", nativeQuery = true)
    long countDeletedAtCourts(List<Long> ids);

    // Cases with a hearing in a date range
    long countByNextHearingBetween(LocalDate from, LocalDate to);

    // Number of open (not deleted) cases of a user per court and district: rows of [court, district, count].
    // A high court has an empty district. Used to find the court a user works at most
    @Query(value = """
        SELECT ct.court, ct.district, COUNT(*)
        FROM cases c JOIN courts ct ON ct.id = c.court_id
        WHERE c.user_id = :userId AND (c.deleted IS NULL OR c.deleted = 0)
        GROUP BY ct.court, ct.district
        """, nativeQuery = true)
    List<Object[]> countByCourtAndDistrict(Long userId);
}