package com.internyay.service;

import com.internyay.dto.HearingLimitsDto;
import com.internyay.entity.Case;
import com.internyay.entity.Hearing;
import com.internyay.entity.HearingDayLimit;
import com.internyay.entity.User;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.HearingDayLimitRepository;
import com.internyay.repository.HearingRepository;
import com.internyay.repository.MiscApplicationHearingRepository;
import com.internyay.repository.NoHearingDateRepository;
import com.internyay.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// The daily hearing limit: the usual limit, a limit for one date, and which hearings count towards a day
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class HearingDayServiceTest {

    // A Monday
    private static final LocalDate DAY = LocalDate.of(2026, 10, 19);
    private static final Long USER = 7L;

    @Mock NoHearingDateRepository noHearingRepo;
    @Mock HearingDayLimitRepository limitRepo;
    @Mock CaseRepository caseRepo;
    @Mock HearingRepository hearingRepo;
    @Mock UserRepository userRepo;
    @Mock MiscApplicationHearingRepository miscHearingRepo;

    private HearingDayService service;
    private User user;

    private static Case caseWithId(long id) {
        Case c = new Case();
        c.setId(id);
        return c;
    }

    private static Hearing hearingOf(long caseId, String outcome) {
        return Hearing.builder().date(DAY).legalCase(caseWithId(caseId)).outcome(outcome).build();
    }

    @BeforeEach
    void setUp() {
        service = new HearingDayService(noHearingRepo, limitRepo, caseRepo, hearingRepo, userRepo, miscHearingRepo);
        user = User.builder().id(USER).build();
        when(userRepo.findById(USER)).thenReturn(Optional.of(user));
        when(limitRepo.findByUserIdAndLimitDate(USER, DAY)).thenReturn(Optional.empty());
        when(caseRepo.findByUser_IdAndNextHearing(USER, DAY)).thenReturn(List.of());
        when(hearingRepo.findWithCaseByUserAndDate(USER, DAY)).thenReturn(List.of());
        when(miscHearingRepo.caseIdsOnDate(USER, DAY)).thenReturn(List.of());
    }

    @Test
    void aMiscApplicationListedOnTheDayCountsItsCase() {
        user.setDailyHearingLimit(2);
        when(caseRepo.findByUser_IdAndNextHearing(USER, DAY)).thenReturn(List.of(caseWithId(1)));
        when(miscHearingRepo.caseIdsOnDate(USER, DAY)).thenReturn(List.of(2L));

        assertThatThrownBy(() -> service.assertAllowed(DAY, USER, 99L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("already has 2 hearings");
    }

    @Test
    void noLimitMeansAnyNumberOfHearings() {
        when(caseRepo.findByUser_IdAndNextHearing(USER, DAY))
                .thenReturn(List.of(caseWithId(1), caseWithId(2), caseWithId(3)));

        assertThatCode(() -> service.assertAllowed(DAY, USER, 99L)).doesNotThrowAnyException();
    }

    @Test
    void aFullDayIsRefusedAndTheMessageNamesTheLimit() {
        user.setDailyHearingLimit(2);
        when(caseRepo.findByUser_IdAndNextHearing(USER, DAY)).thenReturn(List.of(caseWithId(1), caseWithId(2)));

        assertThatThrownBy(() -> service.assertAllowed(DAY, USER, 99L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("already has 2 hearings");
    }

    @Test
    void aDayBelowTheLimitIsAllowed() {
        user.setDailyHearingLimit(3);
        when(caseRepo.findByUser_IdAndNextHearing(USER, DAY)).thenReturn(List.of(caseWithId(1), caseWithId(2)));

        assertThatCode(() -> service.assertAllowed(DAY, USER, 99L)).doesNotThrowAnyException();
    }

    @Test
    void aCaseAlreadyOnTheDayDoesNotCountAgainstItself() {
        user.setDailyHearingLimit(2);
        when(caseRepo.findByUser_IdAndNextHearing(USER, DAY)).thenReturn(List.of(caseWithId(1), caseWithId(2)));

        assertThatCode(() -> service.assertAllowed(DAY, USER, 2L)).doesNotThrowAnyException();
    }

    @Test
    void aCaseWithBothANextDateAndAHistoryEntryCountsOnce() {
        user.setDailyHearingLimit(2);
        when(caseRepo.findByUser_IdAndNextHearing(USER, DAY)).thenReturn(List.of(caseWithId(1)));
        when(hearingRepo.findWithCaseByUserAndDate(USER, DAY)).thenReturn(List.of(hearingOf(1, null)));

        assertThat(service.countOn(DAY, USER, null)).isEqualTo(1);
        assertThatCode(() -> service.assertAllowed(DAY, USER, 99L)).doesNotThrowAnyException();
    }

    @Test
    void withdrawnHearingsDoNotCount() {
        user.setDailyHearingLimit(1);
        when(hearingRepo.findWithCaseByUserAndDate(USER, DAY)).thenReturn(List.of(hearingOf(1, "Withdrawn")));

        assertThat(service.countOn(DAY, USER, null)).isZero();
    }

    @Test
    void theLimitOfADateReplacesTheUsualLimit() {
        user.setDailyHearingLimit(1);
        when(limitRepo.findByUserIdAndLimitDate(USER, DAY))
                .thenReturn(Optional.of(new HearingDayLimit(USER, DAY, 3)));
        when(caseRepo.findByUser_IdAndNextHearing(USER, DAY)).thenReturn(List.of(caseWithId(1), caseWithId(2)));

        assertThat(service.limitFor(DAY, USER)).isEqualTo(3);
        assertThatCode(() -> service.assertAllowed(DAY, USER, 99L)).doesNotThrowAnyException();
    }

    @Test
    void aDateCanBeGivenAHigherLimitThanTheDayCurrentlyHolds() {
        // Raising the limit is how an advocate takes one more hearing on a full day
        user.setDailyHearingLimit(2);
        when(caseRepo.findByUser_IdAndNextHearing(USER, DAY)).thenReturn(List.of(caseWithId(1), caseWithId(2)));
        assertThatThrownBy(() -> service.assertAllowed(DAY, USER, 99L)).isInstanceOf(IllegalArgumentException.class);

        when(limitRepo.findByUserIdAndLimitDate(USER, DAY))
                .thenReturn(Optional.of(new HearingDayLimit(USER, DAY, 3)));
        assertThatCode(() -> service.assertAllowed(DAY, USER, 99L)).doesNotThrowAnyException();
    }

    @Test
    void limitsAreBetweenOneAndTheMaximum() {
        assertThatThrownBy(() -> service.setDefaultLimit(0, USER)).hasMessageContaining("cannot be 0");
        assertThatThrownBy(() -> service.setDefaultLimit(-1, USER)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.setDateLimit(DAY, -1, USER)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.setDateLimit(DAY, HearingDayService.MAX_DAILY_LIMIT + 1, USER))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void settingTheUsualLimitSavesItAndAnEmptyLimitClearsIt() {
        service.setDefaultLimit(5, USER);
        assertThat(user.getDailyHearingLimit()).isEqualTo(5);

        service.setDefaultLimit(null, USER);
        assertThat(user.getDailyHearingLimit()).isNull();
        verify(userRepo, org.mockito.Mockito.times(2)).save(user);
    }

    @Test
    void settingADateLimitTwiceUpdatesTheSameRowAndAnEmptyLimitRemovesIt() {
        HearingDayLimit existing = new HearingDayLimit(USER, DAY, 3);
        when(limitRepo.findByUserIdAndLimitDate(USER, DAY)).thenReturn(Optional.of(existing));

        service.setDateLimit(DAY, 6, USER);
        assertThat(existing.getMaxHearings()).isEqualTo(6);
        verify(limitRepo).save(existing);

        service.setDateLimit(DAY, null, USER);
        verify(limitRepo).deleteByUserIdAndLimitDate(USER, DAY);
    }

    @Test
    void aDateLimitOfZeroMakesItANoHearingDateAndDropsItsLimit() {
        service.setDateLimit(DAY, 0, USER);

        verify(noHearingRepo).save(any());
        verify(limitRepo).deleteByUserIdAndLimitDate(USER, DAY);
        verify(limitRepo, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void aLimitAboveZeroLiftsTheNoHearingMark() {
        service.setDateLimit(DAY, 4, USER);

        verify(noHearingRepo).deleteByUserIdAndBlockedDate(USER, DAY);
        verify(limitRepo).save(any());
    }

    @Test
    void removingTheLimitOfADateAlsoLiftsTheNoHearingMark() {
        service.resetDateLimit(DAY, USER);

        verify(limitRepo).deleteByUserIdAndLimitDate(USER, DAY);
        verify(noHearingRepo).deleteByUserIdAndBlockedDate(USER, DAY);
    }

    @Test
    void limitsListsTheUsualLimitAndTheDates() {
        user.setDailyHearingLimit(4);
        when(limitRepo.findByUserIdOrderByLimitDateAsc(USER))
                .thenReturn(List.of(new HearingDayLimit(USER, DAY, 9)));

        HearingLimitsDto dto = service.limits(USER);

        assertThat(dto.getDefaultLimit()).isEqualTo(4);
        assertThat(dto.getOverrides()).containsEntry(DAY, 9);
    }

    @Test
    void sundaysAndCrossedDatesAreStillRefused() {
        assertThatThrownBy(() -> service.assertAllowed(LocalDate.of(2026, 10, 18), USER, null))
                .hasMessageContaining("Sunday");

        when(noHearingRepo.existsByUserIdAndBlockedDate(USER, DAY)).thenReturn(true);
        assertThatThrownBy(() -> service.assertAllowed(DAY, USER, null))
                .hasMessageContaining("no-hearing date");
    }
}
