package com.internyay.repository;

import com.internyay.entity.CorporateAllotment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CorporateAllotmentRepository extends JpaRepository<CorporateAllotment, Long> {

    List<CorporateAllotment> findByCorporateIdOrderByIdDesc(Long corporateId);

    List<CorporateAllotment> findByCorporateId(Long corporateId);

    List<CorporateAllotment> findByAdvocate_IdOrderByIdDesc(Long advocateId);

    Optional<CorporateAllotment> findByCorporateIdAndCnrNo(Long corporateId, String cnrNo);

    long countByAdvocate_Id(Long advocateId);

    boolean existsBySheetIdAndAdvocate_Id(Long sheetId, Long advocateId);

    void deleteByAdvocate_Id(Long advocateId);

    void deleteByCorporateId(Long corporateId);
}
