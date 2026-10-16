package com.internyay.repository;

import com.internyay.entity.PoliceDistrict;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Police districts in the police directory
public interface PoliceDistrictRepository extends JpaRepository<PoliceDistrict, Long> {

    // All districts in display order
    List<PoliceDistrict> findAllByOrderBySortOrderAscIdAsc();

    // Used to block duplicate names when adding
    boolean existsByNameIgnoreCase(String name);

    // Used to block duplicate names when editing
    boolean existsByNameIgnoreCaseAndIdNot(String name, Long id);
}
