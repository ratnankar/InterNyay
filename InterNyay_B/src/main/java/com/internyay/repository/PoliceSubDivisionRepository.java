package com.internyay.repository;

import com.internyay.entity.PoliceSubDivision;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Sub divisions of a police district
public interface PoliceSubDivisionRepository extends JpaRepository<PoliceSubDivision, Long> {

    // All sub divisions in display order
    List<PoliceSubDivision> findAllByOrderBySortOrderAscIdAsc();

    // Sub divisions of one district
    List<PoliceSubDivision> findByDistrict_Id(Long districtId);

    // Used to block a duplicate ACP in a district when adding
    boolean existsByDistrict_IdAndAcpIgnoreCase(Long districtId, String acp);

    // Used to block a duplicate ACP in a district when editing
    boolean existsByDistrict_IdAndAcpIgnoreCaseAndIdNot(Long districtId, String acp, Long id);
}
