package com.internyay.repository;

import com.internyay.entity.DocumentText;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentTextRepository extends JpaRepository<DocumentText, String> {
}
