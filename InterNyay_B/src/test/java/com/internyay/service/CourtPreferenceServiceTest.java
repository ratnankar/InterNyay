package com.internyay.service;

import com.internyay.dto.CourtPreferenceDto;
import com.internyay.entity.Court;
import com.internyay.entity.User;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.CourtRepository;
import com.internyay.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Which courts the app opens on: the chosen ones, or the courts with the most cases when none were chosen
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CourtPreferenceServiceTest {

    @Mock CourtRepository courtRepo;
    @Mock CaseRepository caseRepo;
    @Mock UserRepository userRepo;

    private CourtPreferenceService service;

    private static Court place(long id, String court, String district, boolean high) {
        return Court.builder().id(id).court(court).district(district).building("").courtNo("").highCourt(high).build();
    }

    private static Court room(long id, String court, String district) {
        return Court.builder().id(id).court(court).district(district).building("A").courtNo("101").highCourt(false).build();
    }

    @BeforeEach
    void setUp() {
        service = new CourtPreferenceService(courtRepo, caseRepo, userRepo);
        when(courtRepo.findAllByOrderByIdAsc()).thenReturn(List.of(
                place(1, "Saket", "South", false),
                place(2, "Rohini", "North West", false),
                place(3, "Delhi High Court", "", true),
                room(4, "Saket", "South")));   // a court room row is never a preference
        when(caseRepo.countByCourtAndDistrict(10L)).thenReturn(List.of(
                new Object[]{"Saket", "South", 2L},
                new Object[]{"Rohini", "North West", 7L}));
    }

    private static User user(String prefs) {
        User u = new User();
        u.setCourtPreferences(prefs);
        return u;
    }

    @Test
    void withoutPreferenceTheCourtWithMostCasesComesFirst() {
        CourtPreferenceDto dto = service.get(user(null), 10L);
        assertThat(dto.isCustom()).isFalse();
        assertThat(dto.getDefaultId()).isEqualTo(2L);
        assertThat(dto.getEffective()).extracting(CourtPreferenceDto.Place::getId).containsExactly(2L, 1L);
    }

    @Test
    void withoutPreferenceAndWithoutCasesThereIsNoDefault() {
        when(caseRepo.countByCourtAndDistrict(11L)).thenReturn(List.of());
        CourtPreferenceDto dto = service.get(user(null), 11L);
        assertThat(dto.getEffective()).isEmpty();
        assertThat(dto.getDefaultId()).isNull();
    }

    @Test
    void chosenCourtsAreUsedAndSortedByCaseCount() {
        CourtPreferenceDto dto = service.get(user("1,2,3"), 10L);
        assertThat(dto.isCustom()).isTrue();
        assertThat(dto.getSaved()).containsExactly(1L, 2L, 3L);
        // Rohini 7, Saket 2, High Court 0
        assertThat(dto.getEffective()).extracting(CourtPreferenceDto.Place::getId).containsExactly(2L, 1L, 3L);
        assertThat(dto.getDefaultId()).isEqualTo(2L);
    }

    @Test
    void choosingACourtCoversAllOfItsDistrictsIncludingNewOnes() {
        when(courtRepo.findAllByOrderByIdAsc()).thenReturn(List.of(
                place(1, "Saket", "South", false),
                place(2, "Rohini", "North West", false),
                place(3, "Delhi High Court", "", true),
                place(5, "Saket", "South East", false)));   // added by the admin after the user chose Saket
        CourtPreferenceDto dto = service.get(user("1"), 10L);
        assertThat(dto.getSaved()).containsExactly(1L, 5L);
        assertThat(dto.getEffective()).extracting(CourtPreferenceDto.Place::getId).containsExactlyInAnyOrder(1L, 5L);
    }

    @Test
    void chosenCourtThatNoLongerExistsIsIgnored() {
        CourtPreferenceDto dto = service.get(user("99,1"), 10L);
        assertThat(dto.getSaved()).containsExactly(1L);
        assertThat(dto.getEffective()).extracting(CourtPreferenceDto.Place::getId).containsExactly(1L);
    }

    @Test
    void saveStoresTheIds() {
        User u = user(null);
        when(userRepo.findById(5L)).thenReturn(Optional.of(u));
        CourtPreferenceDto dto = service.save(5L, 10L, List.of(1L, 2L, 1L));
        assertThat(u.getCourtPreferences()).isEqualTo("1,2");
        assertThat(dto.getSaved()).containsExactly(1L, 2L);
        verify(userRepo).save(u);
    }

    @Test
    void emptyListClearsThePreference() {
        User u = user("1,2");
        when(userRepo.findById(5L)).thenReturn(Optional.of(u));
        CourtPreferenceDto dto = service.save(5L, 10L, List.of());
        assertThat(u.getCourtPreferences()).isNull();
        assertThat(dto.isCustom()).isFalse();
    }

    @Test
    void courtRoomRowsAndUnknownIdsAreRefused() {
        when(userRepo.findById(5L)).thenReturn(Optional.of(user(null)));
        assertThatThrownBy(() -> service.save(5L, 10L, List.of(4L))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.save(5L, 10L, List.of(999L))).isInstanceOf(IllegalArgumentException.class);
        verify(userRepo, never()).save(any());
    }

    @Test
    void tooManyCourtsAreRefused() {
        when(userRepo.findById(5L)).thenReturn(Optional.of(user(null)));
        List<Long> many = new ArrayList<>();
        for (long i = 1; i <= 31; i++) many.add(i);
        assertThatThrownBy(() -> service.save(5L, 10L, many)).isInstanceOf(IllegalArgumentException.class);
    }
}
