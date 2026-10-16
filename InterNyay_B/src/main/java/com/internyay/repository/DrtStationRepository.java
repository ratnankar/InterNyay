package com.internyay.repository;

import com.internyay.entity.DrtStation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Links between DRT tribunals and police stations
public interface DrtStationRepository extends JpaRepository<DrtStation, Long> {

    // All links in display order
    List<DrtStation> findAllByOrderBySortOrderAscIdAsc();

    // Clean up when a tribunal is deleted
    void deleteByTribunal_Id(Long tribunalId);

    // Clean up when a police station is deleted
    void deleteByPoliceStation_Id(Long policeStationId);

    // Clean up when a sub division is deleted
    void deleteByPoliceStation_SubDivision_Id(Long subDivisionId);

    // Same as above for many sub divisions
    void deleteByPoliceStation_SubDivision_IdIn(java.util.Collection<Long> subDivisionIds);
}
