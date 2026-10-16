package com.internyay.repository;

import com.internyay.entity.ConsumerCommission;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Consumer commissions used in the consumer jurisdiction directory
public interface ConsumerCommissionRepository extends JpaRepository<ConsumerCommission, Long> {

    // All commissions in display order
    List<ConsumerCommission> findAllByOrderBySortOrderAscIdAsc();

    // Used to block duplicate kinds when adding
    boolean existsByKind(String kind);

    // Used to block duplicate kinds when editing
    boolean existsByKindAndIdNot(String kind, Long id);
}
