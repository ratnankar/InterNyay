package com.internyay.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.dto.EcourtsImportDto;
import com.internyay.dto.EcourtsImportRequest;
import com.internyay.entity.EcourtsImport;
import com.internyay.repository.EcourtsImportRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Import from eCourts list: kept per account, newest upload wins, only a list of cases with a valid CNR is accepted
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EcourtsImportServiceTest {

    @Mock EcourtsImportRepository repo;
    private final ObjectMapper mapper = new ObjectMapper();
    private EcourtsImportService service;

    private static final String ONE = "[{\"cnr\":\"DLST010012342024\",\"type\":\"BA\"}]";

    @BeforeEach
    void setUp() {
        service = new EcourtsImportService(repo, mapper);
        when(repo.save(any(EcourtsImport.class))).thenAnswer(i -> i.getArgument(0));
    }

    private EcourtsImportRequest req(String json, long updatedAt) throws Exception {
        return new EcourtsImportRequest(mapper.readTree(json), updatedAt);
    }

    @Test
    void nothingImportedReadsAsEmpty() {
        when(repo.findByAccountId(7L)).thenReturn(Optional.empty());
        EcourtsImportDto out = service.get(7L);
        assertThat(out.items()).isNull();
        assertThat(out.updatedAt()).isZero();
    }

    @Test
    void firstUploadIsKeptForTheAccount() throws Exception {
        when(repo.findByAccountId(7L)).thenReturn(Optional.empty());
        EcourtsImportDto out = service.save(7L, req(ONE, 2000L));
        assertThat(out.items()).hasSize(1);
        assertThat(out.updatedAt()).isEqualTo(2000L);
    }

    @Test
    void newerUploadReplacesTheList() throws Exception {
        when(repo.findByAccountId(7L)).thenReturn(Optional.of(
                EcourtsImport.builder().accountId(7L).data("[]").updatedAt(1000L).build()));
        EcourtsImportDto out = service.save(7L, req(ONE, 2000L));
        assertThat(out.items()).hasSize(1);
    }

    @Test
    void olderUploadIsIgnoredAndStoredListReturned() throws Exception {
        when(repo.findByAccountId(7L)).thenReturn(Optional.of(
                EcourtsImport.builder().accountId(7L).data(ONE).updatedAt(5000L).build()));
        EcourtsImportDto out = service.save(7L, req("[{\"cnr\":\"DLST010099992023\"}]", 2000L));
        assertThat(out.updatedAt()).isEqualTo(5000L);
        assertThat(out.items().get(0).path("cnr").asText()).isEqualTo("DLST010012342024");
        verify(repo, never()).save(any());
    }

    @Test
    void rejectsNonListEmptyListAndBadCnr() throws Exception {
        assertThatThrownBy(() -> service.save(7L, req("{\"a\":1}", 1L))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.save(7L, req("[]", 1L))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.save(7L, req("[{\"cnr\":\"short\"}]", 1L))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.save(7L, req("[\"DLST010012342024\"]", 1L))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void clearRemovesTheAccountsList() {
        service.clear(7L);
        verify(repo).deleteByAccountId(7L);
    }
}
