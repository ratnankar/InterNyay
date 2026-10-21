package com.internyay.repository;

import com.internyay.entity.AppPreference;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

// Preferences of the Calendar app
public interface AppPreferenceRepository extends JpaRepository<AppPreference, Long> {

    Optional<AppPreference> findByAccountId(Long accountId);
}
