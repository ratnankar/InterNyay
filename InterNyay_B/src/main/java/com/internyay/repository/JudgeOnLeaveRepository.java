package com.internyay.repository;

import com.internyay.entity.JudgeOnLeave;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

// Judges on leave, collected by the scraper and managed by the admin
public interface JudgeOnLeaveRepository
        extends JpaRepository<JudgeOnLeave, Long> {

    // Finds an existing record so the scraper does not save it twice
    Optional<JudgeOnLeave>
    findFirstByNameAndCourtAndDistrictAndLeaveFromAndLeaveTo(
            String name,
            String court,
            String district,
            LocalDate leaveFrom,
            LocalDate leaveTo
    );

    // Judges on leave today, hidden ones are left out
    @Query("""
        SELECT j
        FROM JudgeOnLeave j
        WHERE (:court IS NULL OR LOWER(j.court) = LOWER(:court))
        AND (:district IS NULL OR LOWER(j.district) = LOWER(:district))
        AND j.leaveFrom <= :today
        AND j.leaveTo >= :today
        AND j.hiddenByAdmin = false
        ORDER BY j.leaveTo ASC
    """)
    List<JudgeOnLeave> findOnLeaveToday(
            @Param("court") String court,
            @Param("district") String district,
            @Param("today") LocalDate today
    );

    // Judges of a court who are on leave on a given date
    @Query("""
        SELECT j
        FROM JudgeOnLeave j
        WHERE LOWER(j.court) = LOWER(:court)
        AND (:district IS NULL OR LOWER(j.district) = LOWER(:district))
        AND j.leaveFrom <= :date
        AND j.leaveTo >= :date
        AND j.hiddenByAdmin = false
    """)
    List<JudgeOnLeave> findOnLeaveOn(
            @Param("court") String court,
            @Param("district") String district,
            @Param("date") LocalDate date
    );

    // Leaves that start after today
    @Query("""
        SELECT j
        FROM JudgeOnLeave j
        WHERE (:court IS NULL OR LOWER(j.court) = LOWER(:court))
        AND (:district IS NULL OR LOWER(j.district) = LOWER(:district))
        AND j.leaveFrom > :today
        AND j.hiddenByAdmin = false
        ORDER BY j.leaveFrom ASC
    """)
    List<JudgeOnLeave> findUpcomingLeave(
            @Param("court") String court,
            @Param("district") String district,
            @Param("today") LocalDate today
    );

    // Leaves that ended before today
    @Query("""
        SELECT j
        FROM JudgeOnLeave j
        WHERE (:court IS NULL OR LOWER(j.court) = LOWER(:court))
        AND (:district IS NULL OR LOWER(j.district) = LOWER(:district))
        AND j.leaveTo < :today
        AND j.hiddenByAdmin = false
        ORDER BY j.leaveFrom DESC, j.name ASC
    """)
    List<JudgeOnLeave> findPastLeave(
            @Param("court") String court,
            @Param("district") String district,
            @Param("today") LocalDate today
    );

    // Everything for the admin, hidden ones included
    @Query("""
        SELECT j
        FROM JudgeOnLeave j
        WHERE (:court IS NULL OR LOWER(j.court) = LOWER(:court))
        AND (:district IS NULL OR LOWER(j.district) = LOWER(:district))
        ORDER BY j.leaveFrom DESC, j.name ASC
    """)
    List<JudgeOnLeave> findAllForAdmin(
            @Param("court") String court,
            @Param("district") String district
    );
}
