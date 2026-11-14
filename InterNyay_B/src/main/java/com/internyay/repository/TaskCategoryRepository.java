package com.internyay.repository;

import com.internyay.entity.TaskCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TaskCategoryRepository extends JpaRepository<TaskCategory, Long> {

    void deleteByUser_Id(Long userId);

    List<TaskCategory> findByUser_IdOrderByNameAsc(Long userId);

    Optional<TaskCategory> findByUser_IdAndNameIgnoreCase(Long userId, String name);
}
