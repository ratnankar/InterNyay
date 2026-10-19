package com.internyay.repository;

import com.internyay.entity.MiscApplicationHearing;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

// Hearing history of the misc. applications
public interface MiscApplicationHearingRepository extends JpaRepository<MiscApplicationHearing, Long> {

    // The dates of several applications at once, newest first
    List<MiscApplicationHearing> findByMiscApplicationIdInOrderByHearingDateDesc(Collection<Long> applicationIds);

    Optional<MiscApplicationHearing> findByMiscApplicationIdAndHearingDate(Long applicationId, LocalDate date);

    boolean existsByMiscApplicationIdAndHearingDate(Long applicationId, LocalDate date);

    // Cases that have a misc. application listed on a date, for the daily hearing limit
    @Query("""
        SELECT DISTINCT a.legalCase.id FROM MiscApplicationHearing h, MiscApplication a
        WHERE h.miscApplicationId = a.id AND a.user.id = :userId AND h.hearingDate = :date
        """)
    List<Long> caseIdsOnDate(@Param("userId") Long userId, @Param("date") LocalDate date);

    // How many hearing dates the applications of each case have, as [caseId, count] rows, for the case hearing counts
    @Query("""
        SELECT a.legalCase.id, COUNT(h) FROM MiscApplicationHearing h, MiscApplication a
        WHERE h.miscApplicationId = a.id AND a.user.id = :userId
        GROUP BY a.legalCase.id
        """)
    List<Object[]> countByCase(@Param("userId") Long userId);
}
