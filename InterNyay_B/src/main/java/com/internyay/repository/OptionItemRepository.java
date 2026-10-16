package com.internyay.repository;

import com.internyay.entity.OptionItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Dropdown choices managed by the admin
public interface OptionItemRepository extends JpaRepository<OptionItem, Long> {

    // Everything, in the order the dropdowns show it
    List<OptionItem> findAllByOrderByListKeyAscParentAscSortOrderAscIdAsc();

    // Choices of one list under one parent
    List<OptionItem> findByListKeyAndParentOrderBySortOrderAscIdAsc(String listKey, String parent);

    List<OptionItem> findByListKey(String listKey);

    // Children of a cascading parent (used when a parent is renamed or deleted)
    List<OptionItem> findByListKeyAndParent(String listKey, String parent);

    boolean existsByListKeyAndParentAndValueIgnoreCase(String listKey, String parent, String value);

    boolean existsByListKeyAndValueIgnoreCaseAndEnabledTrue(String listKey, String value);
}
