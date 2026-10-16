package com.internyay.service;

import com.internyay.dto.FileNumberSummaryDto;
import com.internyay.entity.Case;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

// File numbers are a per-advocate running sequence, numbers of closed cases are reused
@Service
@RequiredArgsConstructor
public class FileNumberService {

    private final CaseRepository caseRepo;
    private final UserRepository userRepo;

    // Next number, how many are in use and which lower numbers were released by closed cases
    @Transactional(readOnly = true)
    public FileNumberSummaryDto summary(Long userId) {

        // Numbers held by open cases
        Set<Integer> occupied = new HashSet<>(caseRepo.openFileSeqs(userId));
        int maxOccupied = occupied.stream().mapToInt(Integer::intValue).max().orElse(0);

        Map<Integer, Object[]> lastClosed = new HashMap<>();
        for (Object[] row : caseRepo.closedFileSeqs(userId)) {
            lastClosed.putIfAbsent((Integer) row[0], row);
        }

        Integer highestIssued = caseRepo.maxFileSeq(userId);

        List<FileNumberSummaryDto.Released> released = new ArrayList<>();
        // Gaps below the highest issued number are the released ones
        for (int n = 1; highestIssued != null && n <= highestIssued; n++) {
            if (occupied.contains(n)) continue;

            Object[] row = lastClosed.get(n);
            released.add(new FileNumberSummaryDto.Released(
                    n,
                    row == null ? null : (String) row[1],
                    row == null ? null : (String) row[2]));
        }

        return FileNumberSummaryDto.builder()
                .nextNumber(maxOccupied + 1)
                .maxOccupied(maxOccupied)
                .occupiedCount(occupied.size())
                .released(released)
                .build();
    }

    // Gives the case the requested number if it is free, otherwise the next one
    public int assign(Case c, Long userId, Integer requested) {

        // Lock the advocate row so two cases saved together can't get the same number
        userRepo.findByIdForUpdate(userId);

        long self = c.getId() == null ? -1L : c.getId();

        Integer top = caseRepo.maxOpenFileSeq(userId);
        int next = (top == null ? 0 : top) + 1;

        int seq = next;
        if (requested != null && requested >= 1 && requested <= next
                && caseRepo.countOpenHolders(userId, requested, self) == 0) {
            seq = requested;
        }

        c.setFileSeq(seq);
        c.setFileNo(String.valueOf(seq));
        return seq;
    }
}
