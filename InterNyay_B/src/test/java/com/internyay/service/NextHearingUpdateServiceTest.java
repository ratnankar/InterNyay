package com.internyay.service;

import com.internyay.entity.Case;
import com.internyay.entity.User;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.CaseRepository.HearingDateDue;
import com.internyay.service.NextHearingUpdateService.Result;
import com.internyay.service.ScrapingService.CaseOutlook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// The next hearing date update: which cases move on, which are tried again at the next run
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NextHearingUpdateServiceTest {

    private static final LocalDate HEARD = LocalDate.of(2026, 10, 27);
    private static final LocalDate NEW_DATE = LocalDate.of(2026, 12, 3);

    @Mock CaseRepository caseRepo;
    @Mock ScrapingService scraping;
    @Mock HearingService hearingService;
    @Mock TransactionTemplate tx;

    private NextHearingUpdateService service;

    @BeforeEach
    void setUp() {
        service = new NextHearingUpdateService(caseRepo, scraping, hearingService, tx, true, 0, 50);
        when(scraping.available()).thenReturn(true);
        // The transaction template just runs what it is given
        doAnswer(inv -> { ((Consumer<?>) inv.getArgument(0)).accept(null); return null; })
                .when(tx).executeWithoutResult(any());
    }

    private static HearingDateDue due(long id, String cnr) {
        HearingDateDue d = org.mockito.Mockito.mock(HearingDateDue.class);
        when(d.getId()).thenReturn(id);
        when(d.getUserId()).thenReturn(1L);
        when(d.getCnrNo()).thenReturn(cnr);
        return d;
    }

    @Test
    void movesACaseToTheLaterDateEcourtsShows() {
        when(caseRepo.findOpenWithCnrListedOn(HEARD)).thenReturn(List.of(due(5, "DLST010000012026")));
        when(scraping.lookUpOutlook("DLST010000012026")).thenReturn(Optional.of(new CaseOutlook(false, NEW_DATE)));
        when(hearingService.applyEcourtsNextHearing(5L, HEARD, NEW_DATE)).thenReturn(true);

        Result r = service.runBlocking(HEARD);

        assertThat(r.due()).isEqualTo(1);
        assertThat(r.updated()).isEqualTo(1);
        assertThat(r.toRetry()).isZero();
    }

    @Test
    void leavesACaseWhoseDateEcourtsHasNotChangedYet() {
        when(caseRepo.findOpenWithCnrListedOn(HEARD)).thenReturn(List.of(due(5, "C1")));
        when(scraping.lookUpOutlook("C1")).thenReturn(Optional.of(new CaseOutlook(false, HEARD)));

        Result r = service.runBlocking(HEARD);

        assertThat(r.updated()).isZero();
        assertThat(r.stillPending()).isEqualTo(1);
        assertThat(r.toRetry()).isEqualTo(1);
        verify(hearingService, never()).applyEcourtsNextHearing(anyLong(), any(), any());
    }

    @Test
    void aCaseWithNoDateOnEcourtsIsTriedAgain() {
        when(caseRepo.findOpenWithCnrListedOn(HEARD)).thenReturn(List.of(due(5, "C1")));
        when(scraping.lookUpOutlook("C1")).thenReturn(Optional.of(new CaseOutlook(false, null)));

        assertThat(service.runBlocking(HEARD).stillPending()).isEqualTo(1);
    }

    @Test
    void anUnreadablePortalPageCountsForTheNextRun() {
        when(caseRepo.findOpenWithCnrListedOn(HEARD)).thenReturn(List.of(due(5, "C1"), due(6, "C2")));
        when(scraping.lookUpOutlook("C1")).thenReturn(Optional.empty());
        when(scraping.lookUpOutlook("C2")).thenReturn(Optional.of(new CaseOutlook(false, NEW_DATE)));
        when(hearingService.applyEcourtsNextHearing(6L, HEARD, NEW_DATE)).thenReturn(true);

        Result r = service.runBlocking(HEARD);

        // One bad case does not stop the others
        assertThat(r.unreadable()).isEqualTo(1);
        assertThat(r.updated()).isEqualTo(1);
    }

    @Test
    void aSavingFailureIsRetriedAndDoesNotStopTheRun() {
        when(caseRepo.findOpenWithCnrListedOn(HEARD)).thenReturn(List.of(due(5, "C1"), due(6, "C2")));
        when(scraping.lookUpOutlook(any())).thenReturn(Optional.of(new CaseOutlook(false, NEW_DATE)));
        when(hearingService.applyEcourtsNextHearing(5L, HEARD, NEW_DATE)).thenThrow(new RuntimeException("db down"));
        when(hearingService.applyEcourtsNextHearing(6L, HEARD, NEW_DATE)).thenReturn(true);

        Result r = service.runBlocking(HEARD);

        assertThat(r.unreadable()).isEqualTo(1);
        assertThat(r.updated()).isEqualTo(1);
    }

    @Test
    void aDisposedCaseIsNotAskedAgainTheSameDay() {
        when(caseRepo.findOpenWithCnrListedOn(HEARD)).thenReturn(List.of(due(5, "C1")));
        when(scraping.lookUpOutlook("C1")).thenReturn(Optional.of(new CaseOutlook(true, null)));

        assertThat(service.runBlocking(HEARD).disposed()).isEqualTo(1);

        // The next hourly run finds nothing left to look up
        assertThat(service.runBlocking(HEARD).due()).isZero();
        verify(scraping).lookUpOutlook("C1");
    }

    @Test
    void withoutTheCaptchaReaderEveryCaseWaitsForTheNextRun() {
        when(scraping.available()).thenReturn(false);
        when(caseRepo.findOpenWithCnrListedOn(HEARD)).thenReturn(List.of(due(5, "C1")));

        Result r = service.runBlocking(HEARD);

        assertThat(r.unreadable()).isEqualTo(1);
        verify(scraping, never()).lookUpOutlook(any());
    }

    @Test
    void doesNothingWhenSwitchedOff() {
        NextHearingUpdateService off = new NextHearingUpdateService(caseRepo, scraping, hearingService, tx, false, 0, 50);

        assertThat(off.runBlocking(HEARD).due()).isZero();
        verify(caseRepo, never()).findOpenWithCnrListedOn(any());
    }

    // ---- manual Refresh button ------------------------------------------------------------------------------------

    private static final LocalDate TODAY = LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"));

    private Case openCase(LocalDate next) {
        Case c = Case.builder().id(7L).cnrNo("C1").status("Pending").nextHearing(next)
                .user(User.builder().id(1L).build()).build();
        when(caseRepo.findById(7L)).thenReturn(Optional.of(c));
        return c;
    }

    @Test
    void refreshMarksADisposedCaseDecidedAndClearsItsDate() {
        Case c = openCase(TODAY);
        when(scraping.lookUpOutlook("C1")).thenReturn(Optional.of(new CaseOutlook(true, TODAY.plusDays(30))));

        var r = service.refreshSingleCase(7L, 1L);

        assertThat(r.status()).isEqualTo("Decided");
        assertThat(r.nextHearing()).isNull();
        assertThat(c.getDecisionDate()).isEqualTo(TODAY);
        verify(hearingService, never()).applyEcourtsNextHearing(anyLong(), any(), any());
    }

    @Test
    void refreshMovesAPassedDateToTheLaterDateOnEcourts() {
        openCase(TODAY.minusDays(1));
        when(scraping.lookUpOutlook("C1")).thenReturn(Optional.of(new CaseOutlook(false, NEW_DATE.plusYears(5))));
        when(hearingService.applyEcourtsNextHearing(7L, TODAY.minusDays(1), NEW_DATE.plusYears(5))).thenReturn(true);

        assertThat(service.refreshSingleCase(7L, 1L).message()).contains("Moved");
    }

    @Test
    void refreshDoesNotTreatAnUpcomingHearingAsHeard() {
        openCase(TODAY.plusDays(10));
        when(scraping.lookUpOutlook("C1")).thenReturn(Optional.of(new CaseOutlook(false, TODAY.plusDays(40))));

        var r = service.refreshSingleCase(7L, 1L);

        assertThat(r.nextHearing()).isEqualTo(TODAY.plusDays(10));
        verify(hearingService, never()).applyEcourtsNextHearing(anyLong(), any(), any());
    }

    @Test
    void refreshRefusesACaseOfAnotherUser() {
        openCase(TODAY);

        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> service.refreshSingleCase(7L, 2L));
    }
}
