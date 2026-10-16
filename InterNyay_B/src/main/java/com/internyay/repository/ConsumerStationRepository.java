package com.internyay.repository;

import com.internyay.entity.ConsumerStation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Links between consumer commissions and police stations
public interface ConsumerStationRepository extends JpaRepository<ConsumerStation, Long> {

    // All links in display order
    List<ConsumerStation> findAllByOrderBySortOrderAscIdAsc();

    // Clean up when a commission is deleted
    void deleteByCommission_Id(Long commissionId);

    // Clean up when a police station is deleted
    void deleteByPoliceStation_Id(Long policeStationId);

    // Clean up when a sub division is deleted
    void deleteByPoliceStation_SubDivision_Id(Long subDivisionId);

    // Same as above for many sub divisions
    void deleteByPoliceStation_SubDivision_IdIn(java.util.Collection<Long> subDivisionIds);
}
