package com.internyay.service;

import com.internyay.entity.Case;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

// A file number typed by the advocate is kept as typed; it is refused, never swapped, when an open case holds it
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FileNumberServiceTest {

    private static final long USER = 1L;

    @Mock CaseRepository caseRepo;
    @Mock UserRepository userRepo;
    private FileNumberService service;

    @BeforeEach
    void setUp() {
        service = new FileNumberService(caseRepo, userRepo);
    }

    @Test
    void typedNumberThatIsFreeIsGivenAsTyped() {
        when(caseRepo.countOpenHolders(eq(USER), eq(25), anyLong())).thenReturn(0L);
        Case c = Case.builder().build();

        service.assignTyped(c, USER, 25);

        assertThat(c.getFileSeq()).isEqualTo(25);
        assertThat(c.getFileNo()).isEqualTo("25");
    }

    @Test
    void typedNumberAboveTheNextOneIsAllowed() {
        // assign() would pull 1043 back to the next number (4); a typed number is kept
        when(caseRepo.maxOpenFileSeq(USER)).thenReturn(3);
        when(caseRepo.countOpenHolders(eq(USER), eq(1043), anyLong())).thenReturn(0L);
        Case c = Case.builder().build();

        service.assignTyped(c, USER, 1043);

        assertThat(c.getFileSeq()).isEqualTo(1043);
        assertThat(c.getFileNo()).isEqualTo("1043");
    }

    @Test
    void typedNumberHeldByAnOpenCaseIsRefused() {
        when(caseRepo.countOpenHolders(eq(USER), eq(7), anyLong())).thenReturn(1L);
        Case c = Case.builder().build();

        assertThatThrownBy(() -> service.assignTyped(c, USER, 7))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("File number 7 is already used");
        assertThat(c.getFileSeq()).isNull();
        assertThat(c.getFileNo()).isNull();
    }

    @Test
    void plainNumbersJoinTheSequenceAndEverythingElseStaysText() {
        assertThat(CaseService.plainFileSeq("25")).isEqualTo(25);
        assertThat(CaseService.plainFileSeq("  25 ")).isEqualTo(25);
        assertThat(CaseService.plainFileSeq("999999999")).isEqualTo(999_999_999);

        assertThat(CaseService.plainFileSeq("007")).isNull();         // leading zeros are part of the number as typed
        assertThat(CaseService.plainFileSeq("0")).isNull();
        assertThat(CaseService.plainFileSeq("-5")).isNull();
        assertThat(CaseService.plainFileSeq("12-A")).isNull();
        assertThat(CaseService.plainFileSeq("FILE/2024/045")).isNull();
        assertThat(CaseService.plainFileSeq("1234567890")).isNull();  // would not fit an int
        assertThat(CaseService.plainFileSeq("")).isNull();
        assertThat(CaseService.plainFileSeq(null)).isNull();
    }
}
