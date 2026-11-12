package com.internyay.repository;

import com.internyay.entity.QuickLink;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuickLinkRepository extends JpaRepository<QuickLink, Long> {

    List<QuickLink> findAllByOrderBySortOrderAscIdAsc();

    List<QuickLink> findAllByGroup_IdOrderBySortOrderAscIdAsc(Long groupId);

    void deleteByGroup_Id(Long groupId);
}
