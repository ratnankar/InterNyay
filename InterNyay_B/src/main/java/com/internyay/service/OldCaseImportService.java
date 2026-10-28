package com.internyay.service;

import com.internyay.entity.Case;
import com.internyay.entity.Hearing;
import com.internyay.entity.User;
import com.internyay.repository.HearingRepository;
import com.internyay.repository.UserRepository;
import com.internyay.util.CaseStatuses;
import com.internyay.util.OrderCutoff;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Map;

// Fills an old case with what eCourts already has: one hearing entry for every past date
@Service
@RequiredArgsConstructor
public class OldCaseImportService {

    private final HearingRepository hearingRepo;
    private final UserRepository userRepo;

    public record Result(int created) {}

    // Creates the missing hearing entries of the case, existing ones are only completed. Returns how many were new
    @Transactional
    public int importHistory(Case c, EcourtsCaseService.Snapshot snap, Long userId) {
        return importHistoryDetailed(c, snap, userId).created();
    }

    // Same as importHistory, with the result as a record (used by the Refresh button)
    @Transactional
    public Result importHistoryDetailed(Case c, EcourtsCaseService.Snapshot snap, Long userId) {

        User user = userRepo.getReferenceById(userId);
        int created = 0;

        for (Map.Entry<LocalDate, String> day : snap.hearings().entrySet()) {
            LocalDate date = day.getKey();

            Hearing h = hearingRepo.findByLegalCase_IdAndUser_IdAndDate(c.getId(), userId, date).orElse(null);
            if (h == null) {
                h = Hearing.builder()
                        .date(date)
                        .legalCase(c)
                        .user(user)
                        .build();
                created++;
            }

            String orderFile = snap.orderFiles().get(date);
            if (orderFile != null) {
                h.setNoOrderOnRecord(false);
                // Only remembered, never downloaded: the "Get order" button is shown for this date
                if (h.getOrderDocId() == null) h.setEcourtsOrderFile(orderFile);
            } else if (h.getOrderDocId() == null && OrderCutoff.passed(date)) {
                h.setNoOrderOnRecord(true);
            }

            // A withdrawn case is marked on the day it was withdrawn, like a case withdrawn inside the app
            boolean decisionDay = snap.disposed() && snap.withdrawn() && date.equals(snap.decisionDate());
            if (decisionDay && h.getOutcome() == null) h.setOutcome(CaseStatuses.WITHDRAWN_OUTCOME);

            hearingRepo.save(h);
        }

        return new Result(created);
    }
}
