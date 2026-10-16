package com.internyay.repository;

import com.internyay.entity.FeeCalculatorConfig;
import org.springframework.data.jpa.repository.JpaRepository;

// Saved fee calculator rules (a single row)
public interface FeeCalculatorConfigRepository extends JpaRepository<FeeCalculatorConfig, Long> {
}
