package com.internyay.repository;

import com.internyay.entity.PoliceAddlDcp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Additional DCPs of a police district
public interface PoliceAddlDcpRepository extends JpaRepository<PoliceAddlDcp, Long> {

    // All in display order
    List<PoliceAddlDcp> findAllByOrderBySortOrderAscIdAsc();

    // Clean up when a police district is deleted
    void deleteByDistrict_Id(Long districtId);
}
