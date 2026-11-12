package com.internyay.repository;

import com.internyay.entity.QuickLinkGroup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuickLinkGroupRepository extends JpaRepository<QuickLinkGroup, Long> {

    List<QuickLinkGroup> findAllByOrderBySortOrderAscIdAsc();
}
