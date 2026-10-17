package com.internyay.service;

import com.internyay.entity.User;
import com.internyay.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

// Deletes an advocate account together with everything it owns
@Service
@RequiredArgsConstructor
public class AccountPurgeService {

    private final UserRepository userRepo;
    private final CaseRepository caseRepo;
    private final ClientRepository clientRepo;
    private final TaskRepository taskRepo;
    private final HearingRepository hearingRepo;
    private final WhatsAppMessageLogRepository whatsAppMessageLogRepo;
    private final NoHearingDateRepository noHearingDateRepo;
    private final HearingDayLimitRepository hearingDayLimitRepo;
    private final OfficeExpenseRepository officeExpenseRepo;
    private final DocumentService documentService;
    private final QrCodeService qrCodeService;

    // Order matters: children first (hearings, tasks, cases, clients, expenses), then the associates (an expense still
    // points at the associate who submitted it), then the user, then stored files
    @Transactional
    public void purge(User advocate) {

        Long id = advocate.getId();

        // The advocate's associates go with the account
        List<User> associates = userRepo.findByAdvocate_IdOrderByCreatedAtDesc(id);

        // Documents first (the advocate's and the associates'), so the database keys never block the delete
        // and every file is removed from storage once the transaction commits
        documentService.deleteAllForUser(id);
        associates.forEach(a -> documentService.deleteAllForUser(a.getId()));

        hearingRepo.deleteByUser_Id(id);
        taskRepo.deleteByUser_Id(id);
        caseRepo.undeleteAllOfUser(id);
        caseRepo.deleteByUser_Id(id);
        clientRepo.deleteByUser_Id(id);
        officeExpenseRepo.deleteByUser_Id(id);
        userRepo.deleteAll(associates);

        whatsAppMessageLogRepo.deleteByUserId(id);
        noHearingDateRepo.deleteByUserId(id);
        hearingDayLimitRepo.deleteByUserId(id);

        userRepo.delete(advocate);
        userRepo.flush();

        qrCodeService.deleteForUser(id);
        associates.forEach(a -> qrCodeService.deleteForUser(a.getId()));
    }
}
