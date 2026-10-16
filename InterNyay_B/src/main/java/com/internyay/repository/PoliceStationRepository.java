package com.internyay.repository;

import com.internyay.entity.PoliceStation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;

// Police stations in the police directory
public interface PoliceStationRepository extends JpaRepository<PoliceStation, Long> {

    // Ids of the stations with this name, ignoring case
    @Query("SELECT s.id FROM PoliceStation s WHERE LOWER(s.name) = LOWER(:name)")
    List<Long> idsByName(String name);

    // Same, limited to stations whose police district is assigned to this court
    @Query("""
        SELECT s.id FROM PoliceStation s
        WHERE LOWER(s.name) = LOWER(:name)
        AND LOWER(s.subDivision.district.court) = LOWER(:court)
        """)
    List<Long> idsByNameAndCourt(String name, String court);

    // All stations in display order
    List<PoliceStation> findAllByOrderBySortOrderAscIdAsc();

    // Clean up when a sub division is deleted
    void deleteBySubDivision_Id(Long subDivisionId);

    // Same as above for many sub divisions
    void deleteBySubDivision_IdIn(Collection<Long> subDivisionIds);

    // Used to block duplicate names in a sub division when adding
    boolean existsBySubDivision_IdAndNameIgnoreCase(Long subDivisionId, String name);

    // Used to block duplicate names in a sub division when editing
    boolean existsBySubDivision_IdAndNameIgnoreCaseAndIdNot(Long subDivisionId, String name, Long id);
}
