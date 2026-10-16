package com.internyay.repository;

import com.internyay.entity.Court;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CourtRepository extends JpaRepository<Court, Long> {

    List<Court> findAllByOrderByIdAsc();

    // Court rooms of a court and district that are marked as Mahila courts
    List<Court> findByCourtAndDistrictAndMahilaCourtTrue(String court, String district);

    List<Court> findByMahilaCourtTrue();

    boolean existsByCourtAndDistrictAndBuildingAndCourtNo(String court, String district, String building, String courtNo);
}
