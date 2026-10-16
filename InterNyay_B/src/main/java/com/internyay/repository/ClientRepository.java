package com.internyay.repository;

import com.internyay.entity.Client;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;

// Clients of an advocate
public interface ClientRepository extends JpaRepository<Client, Long> {

    // Client list with search by name or email and a type filter
    @Query("""
        SELECT c FROM Client c
        WHERE c.user.id = :userId
        AND (:search IS NULL OR LOWER(c.name) LIKE LOWER(CONCAT('%',:search,'%'))
             OR LOWER(c.email) LIKE LOWER(CONCAT('%',:search,'%')))
        AND (:type IS NULL OR c.type = :type)
        """)
    Page<Client> findByFilters(Long userId, String search, Client.ClientType type, Pageable pageable);

    // Removes every client of a user
    void deleteByUser_Id(Long userId);

    // All clients of one user
    List<Client> findByUser_Id(Long userId);

    // Creation dates of clients from a date, for the admin growth chart
    @Query("SELECT c.createdAt FROM Client c WHERE c.createdAt >= :from")
    List<LocalDateTime> createdSince(LocalDateTime from);
}
