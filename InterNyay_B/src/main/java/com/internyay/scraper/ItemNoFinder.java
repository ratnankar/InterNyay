package com.internyay.scraper;

import java.util.Optional;

// Finds the item (serial) number of a case in one cause list PDF. One implementation per court,
// because every court writes its case numbers differently.
public interface ItemNoFinder {

    Optional<Integer> findItemNo(String caseNo);
}
