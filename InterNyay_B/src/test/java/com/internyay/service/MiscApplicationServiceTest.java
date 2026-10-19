package com.internyay.service;

import com.internyay.dto.MiscApplicationRequest;
import com.internyay.entity.Case;
import com.internyay.entity.MiscApplication;
import com.internyay.entity.User;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.MiscApplicationHearingRepository;
import com.internyay.repository.MiscApplicationRepository;
import com.internyay.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Misc. applications: ownership, disposing off, reopening and renaming the type
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MiscApplicationServiceTest {

    private static final Long OWNER = 7L;
    private static final Long OTHER = 8L;

    @Mock MiscApplicationRepository repo;
    @Mock CaseRepository caseRepo;
    @Mock UserRepository userRepo;
    @Mock CaseService caseService;
    @Mock DocumentService documentService;
    @Mock HearingDayService hearingDays;
    @Mock MiscApplicationHearingRepository hearingRepo;

    private MiscApplicationService service;
    private MiscApplication app;

    @BeforeEach
    void setUp() {
        service = new MiscApplicationService(repo, caseRepo, userRepo, caseService, documentService, hearingDays, hearingRepo);

        User owner = new User();
        owner.setId(OWNER);
        Case c = new Case();
        c.setId(3L);

        app = MiscApplication.builder().id(1L).legalCase(c).user(owner).applicationType("Bail Application").build();
        when(repo.findWithCaseById(1L)).thenReturn(Optional.of(app));
        when(repo.save(any(MiscApplication.class))).thenAnswer(i -> i.getArgument(0));
        when(documentService.listForOwnedMiscApplication(anyLong())).thenReturn(List.of());
        when(hearingRepo.findByMiscApplicationIdInOrderByHearingDateDesc(any())).thenReturn(List.of());
    }

    @Test
    void someoneElsesApplicationIsNotFound() {
        assertThatThrownBy(() -> service.get(1L, OTHER)).isInstanceOf(NoSuchElementException.class);
        assertThatThrownBy(() -> service.dispose(1L, null, "Allowed", OTHER)).isInstanceOf(NoSuchElementException.class);
        assertThatThrownBy(() -> service.delete(1L, OTHER)).isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void disposingNeedsAnOutcomeAndKeepsItInAnyLetterCase() {
        assertThatThrownBy(() -> service.dispose(1L, null, null, OWNER)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.dispose(1L, null, "maybe", OWNER)).isInstanceOf(IllegalArgumentException.class);

        service.dispose(1L, "2026-10-19", "disallowed", OWNER);
        assertThat(app.getStatus()).isEqualTo(MiscApplication.DISPOSED_OFF);
        assertThat(app.getDisposalOutcome()).isEqualTo(MiscApplication.DISALLOWED);
        assertThat(app.getDisposedOn()).hasToString("2026-10-19");
    }

    @Test
    void reopeningClearsTheDisposal() {
        service.dispose(1L, "2026-10-19", "Allowed", OWNER);
        service.reopen(1L, OWNER);
        assertThat(app.getStatus()).isEqualTo(MiscApplication.PENDING);
        assertThat(app.getDisposedOn()).isNull();
        assertThat(app.getDisposalOutcome()).isNull();
    }

    @Test
    void renamingTheTypeRenamesTheApplicationFile() {
        MiscApplicationRequest req = new MiscApplicationRequest();
        req.setApplicationType("Stay Application");

        service.update(1L, req, OWNER);

        assertThat(app.getApplicationType()).isEqualTo("Stay Application");
        verify(documentService).retypeMiscDocuments(1L, "APPLICATION", "Stay Application");
    }

    @Test
    void aBadHearingDateIsRefused() {
        MiscApplicationRequest req = new MiscApplicationRequest();
        req.setApplicationType("Bail Application");
        req.setHearingDate("19-10-2026");

        assertThatThrownBy(() -> service.update(1L, req, OWNER)).isInstanceOf(IllegalArgumentException.class);
    }
}
