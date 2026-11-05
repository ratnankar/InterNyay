package com.internyay.scraper;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

// The tables a district court website answers with (southdelhi.dcourts.gov.in, Cause List / Daily Board), cut down to a few rows
class DistrictSiteListTest {

    private static final String RESULT = """
            <div class="distTableContent">
              <table class="data-table-1">
                <caption>Misc. cases</caption>
                <thead><tr><th scope="col">Serial Number</th><th scope="col">Case Type/Case Number/Case Year</th>
                  <th scope="col">Party Name</th><th scope="col">Advocate</th></tr></thead>
                <tbody>
                  <tr>
                    <td data-th="Serial Number"><span class="bt-content">1</span></td>
                    <td data-th="Case Type/Case Number/Case Year"><span class="bt-content"><a class="viewCnrDetails" href="javascript:void(0);" data-cno="DLST010061802020">CS DJ/500/2020</a></span></td>
                    <td data-th="Party Name"><span class="bt-content">CHAND SETH Vs ANIL AGGARWAL</span></td>
                    <td data-th="Advocate"><span class="bt-content">SUSHIL SHUKLA</span></td>
                  </tr>
                  <tr>
                    <td data-th="Serial Number"><span class="bt-content">2</span></td>
                    <td data-th="Case Type/Case Number/Case Year"><span class="bt-content"><a class="viewCnrDetails" href="javascript:void(0);" data-cno="DLST010072262022">EX/246/2022</a></span></td>
                    <td data-th="Party Name"><span class="bt-content">SHAKUNTALA Vs RAJESH KUMAR AND AND ANR</span></td>
                    <td class="bt-hide"></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="distTableContent">
              <table class="data-table-1">
                <caption>Plaintiff/Petitioner Evidence</caption>
                <tbody>
                  <tr>
                    <td data-th="Serial Number"><span class="bt-content">19</span></td>
                    <td data-th="Case Type/Case Number/Case Year"><span class="bt-content"><a class="viewCnrDetails" href="javascript:void(0);" data-cno="DLST010113872025">Misc DJ/201/2025</a></span></td>
                    <td data-th="Party Name"><span class="bt-content">LATA Vs KRISHAN PAL SINGH</span></td>
                    <td data-th="Advocate"><span class="bt-content">Ajit Kumar Gola</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
            """;

    @Test
    void readsSerialNumbersFromTheSitesTables() {
        Map<CaseKey, Integer> serials = DistrictCauseListParser.serialNumbers(RESULT);

        assertEquals(1, serials.get(new CaseKey("CSDJ", 500, 2020)));
        assertEquals(2, serials.get(new CaseKey("EX", 246, 2022)));
        assertEquals(19, serials.get(new CaseKey("MISCDJ", 201, 2025)));
        assertNull(serials.get(new CaseKey("CSDJ", 501, 2020)));
    }

    @Test
    void districtWebsiteIsTheLeavePageWithoutItsLastSegment() {
        assertEquals(Optional.of("https://southdelhi.dcourts.gov.in/"), DistrictSiteUrls.baseUrlFor("South"));
        assertEquals(Optional.of("https://southeastdelhi.dcourts.gov.in/"), DistrictSiteUrls.baseUrlFor("South East"));
        assertEquals(Optional.of("https://northeast.dcourts.gov.in/"), DistrictSiteUrls.baseUrlFor("North-East"));
    }

    @Test
    void rouseAvenueIsReadFromTheNewDelhiWebsite() {
        assertEquals(Optional.of("https://newdelhi.dcourts.gov.in/"), DistrictSiteUrls.baseUrlFor("Rouse Avenue"));
    }

    @Test
    void gurugramIsReadFromItsOwnWebsite() {
        assertEquals(Optional.of("https://gurugram.dcourts.gov.in/"), DistrictSiteUrls.baseUrlFor("Gurugram"));
    }

    @Test
    void districtWithoutAWebsiteHasNone() {
        assertEquals(Optional.empty(), DistrictSiteUrls.baseUrlFor("Faridabad"));
        assertEquals(Optional.empty(), DistrictSiteUrls.baseUrlFor(null));
    }
}
