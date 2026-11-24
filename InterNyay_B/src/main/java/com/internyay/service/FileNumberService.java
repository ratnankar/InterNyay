package com.internyay.service;

import com.internyay.dto.FileNumberSummaryDto;
import com.internyay.entity.Case;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.UserRepository;
import com.internyay.util.CaseStatuses;
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

        List<FileNumberSummaryDto.Occupied> holders = new ArrayList<>();
        for (Object[] row : caseRepo.openFileHolders(userId)) {
            holders.add(new FileNumberSummaryDto.Occupied(
                    (Integer) row[0],
                    ((Number) row[1]).longValue(),
                    (String) row[2],
                    (String) row[3]));
        }

        return FileNumberSummaryDto.builder()
                .nextNumber(maxOccupied + 1)
                .maxOccupied(maxOccupied)
                .occupiedCount(occupied.size())
                .released(released)
                .occupied(holders)
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

    // Gives the case the number the advocate typed. Unlike assign, it never swaps it for another number:
    // a number an open case already holds is refused, and a number above the next one is allowed
    public int assignTyped(Case c, Long userId, int seq) {

        // Lock the advocate row so two cases saved together can't get the same number
        userRepo.findByIdForUpdate(userId);

        long self = c.getId() == null ? -1L : c.getId();

        if (caseRepo.countOpenHolders(userId, seq, self) > 0) {
            throw new IllegalArgumentException("File number " + seq + " is already used by another open case");
        }

        c.setFileSeq(seq);
        c.setFileNo(String.valueOf(seq));
        return seq;
    }

    // Like assignTyped, but when exactly one other open case already holds the number and the advocate asked for an
    // exchange, the two swap: this case takes the number and the holder gets the number this case had, or, when this
    // case has no number yet (a new case), the next free number
    public int assignTypedOrExchange(Case c, Long userId, int seq, boolean exchange) {

        if (!exchange) return assignTyped(c, userId, seq);

        // Lock the advocate row so two cases saved together can't get the same number
        userRepo.findByIdForUpdate(userId);

        long self = c.getId() == null ? -1L : c.getId();

        List<Case> holders = caseRepo.openHolders(userId, seq, self);
        if (holders.isEmpty()) return assignTyped(c, userId, seq);

        if (holders.size() > 1) {
            throw new IllegalArgumentException("More than one open case holds file number " + seq + ", it cannot be exchanged");
        }

        Case other = holders.get(0);

        Integer top = caseRepo.maxOpenFileSeq(userId);
        int handOver = c.getFileSeq() != null ? c.getFileSeq() : (top == null ? 0 : top) + 1;

        other.setFileSeq(handOver);
        other.setFileNo(String.valueOf(handOver));
        caseRepo.save(other);

        c.setFileSeq(seq);
        c.setFileNo(String.valueOf(seq));
        return seq;
    }

    @Transactional
    public List<Case> exchange(Long caseId, Long userId, int seq) {

        userRepo.findByIdForUpdate(userId);

        Case current = caseRepo.findById(caseId).orElseThrow(() -> new IllegalArgumentException("Case not found"));
        if (!current.getUser().getId().equals(userId)) throw new IllegalArgumentException("Case not found");

        if (CaseStatuses.isClosed(current.getStatus()) || current.getFileSeq() == null) {
            throw new IllegalArgumentException("Only an open case with a file number can exchange it");
        }

        if (current.getFileSeq() == seq) {
            throw new IllegalArgumentException("This case already has file number " + seq);
        }

        List<Case> holders = caseRepo.openHolders(userId, seq, current.getId());
        if (holders.isEmpty()) {
            throw new IllegalArgumentException("No open case holds file number " + seq);
        }
        if (holders.size() > 1) {
            throw new IllegalArgumentException("More than one open case holds file number " + seq + ", it cannot be exchanged");
        }

        Case other = holders.get(0);
        int mine = current.getFileSeq();

        current.setFileSeq(seq);
        current.setFileNo(String.valueOf(seq));
        other.setFileSeq(mine);
        other.setFileNo(String.valueOf(mine));

        caseRepo.saveAll(List.of(current, other));
        return List.of(current, other);
    }

    @Transactional
    public Case change(Long caseId, Long userId, int seq) {

        userRepo.findByIdForUpdate(userId);

        Case current = caseRepo.findById(caseId).orElseThrow(() -> new IllegalArgumentException("Case not found"));
        if (!current.getUser().getId().equals(userId)) throw new IllegalArgumentException("Case not found");

        if (CaseStatuses.isClosed(current.getStatus())) {
            throw new IllegalArgumentException("The file number of a closed case cannot be changed");
        }

        if (current.getFileSeq() != null && current.getFileSeq() == seq) {
            throw new IllegalArgumentException("This case already has file number " + seq);
        }

        assignTyped(current, userId, seq);
        return caseRepo.save(current);
    }
}
