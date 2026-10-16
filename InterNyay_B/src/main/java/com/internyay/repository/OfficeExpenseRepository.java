package com.internyay.repository;

import com.internyay.entity.OfficeExpense;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Office expenses of an advocate and their associates
public interface OfficeExpenseRepository extends JpaRepository<OfficeExpense, Long> {

    // All expenses of an advocate, latest first
    @EntityGraph(attributePaths = {"user", "submittedBy"})
    List<OfficeExpense> findByUser_IdOrderByCreatedAtDesc(Long userId);

    // Expenses submitted by one person, used for associates
    @EntityGraph(attributePaths = {"user", "submittedBy"})
    List<OfficeExpense> findByUser_IdAndSubmittedBy_IdOrderByCreatedAtDesc(Long userId, Long submittedById);

    // Expense with its advocate and submitter loaded, so it can be read outside a session
    @EntityGraph(attributePaths = {"user", "submittedBy"})
    java.util.Optional<OfficeExpense> findWithPeopleById(Long id);

    // Removes every expense of a user
    void deleteByUser_Id(Long userId);
}
