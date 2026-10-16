package com.internyay.repository;

import com.internyay.entity.DrtTribunal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// DRT tribunals used in the DRT jurisdiction directory
public interface DrtTribunalRepository extends JpaRepository<DrtTribunal, Long> {

    // All tribunals in display order
    List<DrtTribunal> findAllByOrderBySortOrderAscIdAsc();

    // Used to block duplicate kinds when editing
    boolean existsByKindAndIdNot(String kind, Long id);

    // Used to block duplicate kinds when adding
    boolean existsByKind(String kind);
}
