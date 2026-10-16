package com.internyay.repository;

import com.internyay.entity.JudgeProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

// Judges (name and photo)
public interface JudgeProfileRepository extends JpaRepository<JudgeProfile, Long> {

    // Judges who can be picked, by name (the special "Vacant" profile is not a judge)
    List<JudgeProfile> findByActiveTrueAndVacantFalseOrderByNameAsc();

    // The special profile a court holds while it has no judge
    Optional<JudgeProfile> findFirstByVacantTrue();

    // Judges with this name key, switched off ones included
    List<JudgeProfile> findByNameKey(String nameKey);
}
