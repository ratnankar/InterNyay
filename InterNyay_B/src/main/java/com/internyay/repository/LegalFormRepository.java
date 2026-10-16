package com.internyay.repository;

import com.internyay.entity.LegalForm;
import org.springframework.data.jpa.repository.JpaRepository;

// Legal forms uploaded by the admin
public interface LegalFormRepository extends JpaRepository<LegalForm, Long> {
}
