package com.internyay.service;

import com.internyay.entity.Case;
import com.internyay.entity.Court;
import com.internyay.repository.CaseRepository;
import com.internyay.scraper.CauseListFetch;
import com.internyay.scraper.CauseListUnavailableException;
import com.internyay.scraper.DelhiHighCourtCauseListClient;
import com.internyay.scraper.DelhiHighCourtCauseListClient.CauseListDocument;
import com.internyay.scraper.SupremeCourtCauseListClient;
import com.internyay.service.CauseListService.CaseLookup;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CauseListServiceTest {

    private static final LocalDate DATE = LocalDate.of(2026, 11, 10);

    private final DelhiHighCourtCauseListClient delhi = mock(DelhiHighCourtCauseListClient.class);
    private final SupremeCourtCauseListClient supreme = mock(SupremeCourtCauseListClient.class);

    private final CauseListService service = new CauseListService(
            mock(CaseRepository.class), mock(CourtService.class), delhi, supreme,
            true, "Delhi High Court,High Court of Delhi", true, "Supreme Court of India,Supreme Court", 5);

    private static Case caseOf(String court, String caseNo) {
        return Case.builder()
                .id(1L)
                .caseNo(caseNo)
                .courtPlace(Court.builder().court(court).highCourt(true).build())
                .build();
    }

    private static CauseListDocument document() {
        return new CauseListDocument("Advance List", List.of("1. W.P.(C) 1234/2024 RAM KUMAR vs UNION OF INDIA"));
    }

    @Test
    void recognisesTheConfiguredCourtNames() {
        assertTrue(service.readsFromPdf(caseOf("Delhi High Court", "W.P.(C) 1234/2024")));
        assertTrue(service.readsFromPdf(caseOf(" high court of delhi ", "W.P.(C) 1234/2024")));
        assertTrue(service.readsFromPdf(caseOf("Supreme Court", "SLP(C) 13912/2024")));
        assertFalse(service.readsFromPdf(caseOf("Madras High Court", "W.P. 12/2024")));
    }

    @Test
    void caseNumberWithoutTypeOrYearIsNotSearchable() {
        assertFalse(service.hasSearchableCaseNo(caseOf("Delhi High Court", null)));
        assertFalse(service.hasSearchableCaseNo(caseOf("Delhi High Court", " ")));
        assertFalse(service.hasSearchableCaseNo(caseOf("Delhi High Court", "1234")));
        assertTrue(service.hasSearchableCaseNo(caseOf("Delhi High Court", "W.P.(C) 1234/2024")));
    }

    @Test
    void findsTheItemNumberAndReadsThePdfsOnlyOnceInTheCacheWindow() {
        when(delhi.fetch(DATE)).thenReturn(new CauseListFetch(List.of(document()), true));
        Case c = caseOf("Delhi High Court", "W.P.(C) 1234/2024");

        CaseLookup first = service.lookUpCase(c, DATE);
        CaseLookup second = service.lookUpCase(c, DATE);

        assertTrue(first.listPublished());
        assertEquals(1, first.itemNo());
        assertEquals(1, second.itemNo());
        verify(delhi, times(1)).fetch(DATE);
    }

    @Test
    void nothingPublishedIsNotCached() {
        when(delhi.fetch(DATE)).thenReturn(CauseListFetch.nothingPublished());
        Case c = caseOf("Delhi High Court", "W.P.(C) 1234/2024");

        CaseLookup lookup = service.lookUpCase(c, DATE);
        service.lookUpCase(c, DATE);

        assertFalse(lookup.listPublished());
        assertNull(lookup.itemNo());
        verify(delhi, times(2)).fetch(DATE);
    }

    @Test
    void caseMissingFromAnIncompleteReadIsAFailureAndNotAbsent() {
        when(delhi.fetch(DATE)).thenReturn(new CauseListFetch(List.of(document()), false));
        Case c = caseOf("Delhi High Court", "CS(OS) 77/2020");

        assertThrows(CauseListUnavailableException.class, () -> service.lookUpCase(c, DATE));
    }

    @Test
    void caseFoundInAnIncompleteReadIsStillReturned() {
        when(delhi.fetch(DATE)).thenReturn(new CauseListFetch(List.of(document()), false));
        Case c = caseOf("Delhi High Court", "W.P.(C) 1234/2024");

        assertEquals(1, service.lookUpCase(c, DATE).itemNo());
    }

    @Test
    void unreadableCourtSiteSurfacesAsAFailure() {
        when(supreme.fetch(DATE)).thenThrow(new CauseListUnavailableException("down"));
        Case c = caseOf("Supreme Court of India", "SLP(C) 13912/2024");

        assertThrows(CauseListUnavailableException.class, () -> service.lookUpCase(c, DATE));
    }
}
