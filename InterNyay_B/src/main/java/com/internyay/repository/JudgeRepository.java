package com.internyay.repository;

import com.internyay.dto.JudgeCourtNoDto;
import com.internyay.dto.JudgeSeatDto;
import com.internyay.entity.Judge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

// Listings of the Judges List (court seats with their judge). Removed listings (active = false) are only kept for their
// court history: every query below that feeds a screen or matches cases leaves them out
public interface JudgeRepository extends JpaRepository<Judge, Long> {

    // Listings of a court and district, null filters match everything
    @Query("""
        SELECT j FROM Judge j
        WHERE j.active = true
        AND (:court IS NULL OR j.court = :court)
        AND (:district IS NULL OR j.district = :district)
        ORDER BY j.court, j.district, j.profile.name
        """)
    List<Judge> findByFilters(String court, String district);

    // Search by judge name, the pattern is already lower case with %
    @Query("""
        SELECT j FROM Judge j
        WHERE j.active = true
        AND LOWER(j.profile.name) LIKE :pattern
        AND j.profile.vacant = false
        AND (:court IS NULL OR j.court = :court)
        AND (:district IS NULL OR j.district = :district)
        ORDER BY j.profile.name, j.court, j.district
        """)
    List<Judge> searchByName(String pattern, String court, String district);

    // Court room numbers with the judge name, used to match eCourts data
    @Query("""
        SELECT new com.internyay.dto.JudgeCourtNoDto(j.courtRoomNo, j.profile.name, j.building, j.floor)
        FROM Judge j
        WHERE j.active = true
        AND j.courtRoomNo IS NOT NULL AND j.courtRoomNo <> ''
        AND (:court IS NULL OR j.court = :court)
        AND (:district IS NULL OR j.district = :district)
        ORDER BY j.courtRoomNo, j.profile.name
        """)
    List<JudgeCourtNoDto> findCourtNumbers(String court, String district);

    // Every live listing without the photo, used to find the courts each judge holds
    @Query("""
        SELECT new com.internyay.dto.JudgeSeatDto(j.id, j.profile.id, j.profile.name, j.court, j.district, j.building, j.floor, j.courtRoomNo)
        FROM Judge j
        WHERE j.active = true
        """)
    List<JudgeSeatDto> findAllSeats();

    // Live listings in one court room of a court row
    List<Judge> findByCourtIdAndCourtRoomNoIgnoreCaseAndActiveTrue(Long courtId, String courtRoomNo);

    // Live listings in one court room of a court and district (district is empty for a listing without a district)
    List<Judge> findByCourtAndDistrictAndCourtRoomNoIgnoreCaseAndActiveTrue(String court, String district, String courtRoomNo);

    // Live listings held by a judge
    List<Judge> findByProfileIdAndActiveTrue(Long profileId);

    // True when a judge has any listing, removed ones included
    boolean existsByProfileId(Long profileId);

    long countByActiveTrue();
}
