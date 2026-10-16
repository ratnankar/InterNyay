package com.internyay.repository;

import com.internyay.entity.Plan;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

// Subscription plans
public interface PlanRepository extends JpaRepository<Plan, Long> {
    // Plan by its code, like FREE or BASIC
    Optional<Plan> findByCode(String code);
    // All plans in display order
    List<Plan> findAllByOrderBySortOrderAsc();
}
