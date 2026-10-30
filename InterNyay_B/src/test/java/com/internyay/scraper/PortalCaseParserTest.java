package com.internyay.scraper;

import com.internyay.scraper.PortalCaseParser.ParsedCase;
import com.internyay.service.EcourtsCaseService;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

// The case page of the eCourts Services portal, copied as text (src/test/resources/portal/case-page.txt)
class PortalCaseParserTest {

    private static ParsedCase page() throws IOException {
        String text = new String(PortalCaseParserTest.class.getResourceAsStream("/portal/case-page.txt").readAllBytes(), StandardCharsets.UTF_8);
        List<String> lines = new ArrayList<>();
        for (String l : text.split("\n")) if (!l.isBlank()) lines.add(l.strip());
        return PortalCaseParser.fromLines(lines, List.of());
    }

    @Test
    void readsTheCaseDetails() throws IOException {
        ParsedCase p = page();
        assertTrue(p.found());
        assertEquals("Chief Metropolitan Magistrate, South, Saket", p.establishment());
        assertEquals("DLST020159882023", p.cnr());
        assertEquals("6642/2023", p.registrationNumber());
        assertEquals(LocalDate.of(2023, 7, 31), p.filingDate());
        assertEquals(LocalDate.of(2026, 12, 7), p.nextHearing());
        assertEquals("785", p.courtNo());
        assertEquals(List.of("MANISH TANEJA"), p.petitioners());
        assertEquals(List.of("SHILPI SINGH"), p.petitionerAdvocates());
        assertEquals(List.of("AJITESH PRADHAN"), p.respondents());
        assertFalse(p.disposed());
        assertEquals("ECDLST02070172023", p.efilingNumber());
    }

    @Test
    void readsHistoryAndOrders() throws IOException {
        ParsedCase p = page();
        assertEquals(30, p.history().size());
        assertEquals(28, p.orders().size());
        assertEquals(LocalDate.of(2023, 8, 1), p.orders().get(0).date());
        assertEquals("order-28.pdf", p.orders().get(27).fileName());
    }

    @Test
    void buildsTheFormValues() throws IOException {
        EcourtsCaseService.CaseDetail d = EcourtsCaseService.detailOf(page());
        assertEquals("CC NI ACT 6642/2023", d.caseNo());
        assertEquals("Criminal", d.caseNature());
        assertEquals("Pending", d.status());
        assertEquals("2026-12-07", d.nextHearing());
        assertEquals(28, d.orderCount());
        assertEquals("Complainaint Evidence", d.caseStage());
        assertEquals("Negotiable Instruments Act - Section 138", d.actsSections());
        assertEquals("2023-08-01", d.registrationDate());
        assertEquals("2023-08-01", d.firstHearingDate());
        assertEquals("ECDLST02070172023", d.efilingNo());
        assertEquals("", d.decisionDate());
    }

    @Test
    void readsOrderLinksFromHtml() {
        String html = "<h2>Court</h2><div>Case Details</div><table><tr><td>Case Type</td><td>CC</td></tr>"
                + "<tr><td>CNR Number</td><td>DLST020159882023</td></tr></table><h4>Interim Orders</h4>"
                + "<table><tr><th>Order Number</th><th>Order Date</th></tr><tr><td>1</td><td>01-08-2023</td>"
                + "<td><a href='#' onclick=\"displayPdf('normal_pdf=a&case_val=X&filename=/o/1.pdf')\">COPY OF ORDER</a></td></tr></table>";
        ParsedCase p = PortalCaseParser.parse(html);
        assertEquals(1, p.orders().size());
        assertEquals("normal_pdf=a&case_val=X&filename=/o/1.pdf", p.orders().get(0).link());
    }

    // Family courts write the court room with a letter prefix, and a family or Mahila court case lists no party names
    @Test
    void readsFamilyCourtRoomAndEmptyParties() {
        List<String> lines = new ArrayList<>(List.of(
                "Family Court, Shahdara, Karkardooma",
                "Case Details",
                "Case Type\tHMA",
                "CNR Number\tDLSH010012342024",
                "Court Number and Judge\tFC-46-Judge-Family Court-01"));
        ParsedCase p = PortalCaseParser.fromLines(lines, List.of());
        assertEquals("FC-46", p.courtNo());
        assertEquals("Judge-Family Court-01", p.judge());
        assertTrue(p.petitioners().isEmpty());
        assertTrue(p.respondents().isEmpty());
        assertTrue(p.orders().isEmpty());
    }

    // The current portal page: displayPdf takes five separate arguments, not a query string
    @Test
    void readsOrderLinksWithSeparateArguments() {
        String html = "<h2>Chief Metropolitan Magistrate, South, Saket</h2><h3>Case Details</h3><table><tr><th>Case Type</th>"
                + "<td>CT Cases - COMPLAINT CASES</td></tr><tr><th>CNR Number</th><td>DLST020370922026</td></tr></table>"
                + "<h3>Interim Orders </h3><table><thead><tr><th>Order Number</th><th>Order Date</th><th>Order Details</th></tr></thead>"
                + "<tbody><tr><td>&nbsp;&nbsp;1</td><td>&nbsp;&nbsp;08-07-2026</td><td><a href='#' onclick=\"displayPdf('cl+sGJ==','2gPs/U+x=','1Wa2==','XFoE+/8k0','')\">COPY OF ORDER</a></td></tr>"
                + "<tr><td>&nbsp;&nbsp;2</td><td>&nbsp;&nbsp;23-10-2026</td><td><a href='#' onclick=\"displayPdf('cl+sGJ==','2gPs/U+x=','1Wa2==','XFoE+/Z6T','')\">COPY OF ORDER</a></td></tr></tbody></table>";
        ParsedCase p = PortalCaseParser.parse(html);
        assertEquals(2, p.orders().size());
        assertEquals("normal_v=cl%2BsGJ%3D%3D&case_val=2gPs%2FU%2Bx%3D&court_code=1Wa2%3D%3D&filename=XFoE%2B%2F8k0&appFlag=",
                p.orders().get(0).link());
        assertNotEquals(p.orders().get(0).link(), p.orders().get(1).link());
    }

    @Test
    void keepsAQueryStringLinkAsIs() {
        assertEquals("a=1&b=%2Fx.pdf", PortalCaseParser.pdfLink("'a=1&b=%2Fx.pdf'"));
    }
    @Test
    void readsAFilingStageCasePage() {
        String html = "<button id=\"main_back_cnr\">Back</button><div id=\"history_cnr\"><h2>Case Details</h2>"
                + "<table><tr><th>Case Code</th><td>203600358752026</td></tr>"
                + "<tr><th> Filing Number</th><td>Misc Crl/35875/2026</td></tr>"
                + "<tr><th>Filing Date</th><td><b>14-08-2026</b></td></tr>"
                + "<tr><th>CNR Number</th><td><b>DLCT020358762026</b></td></tr></table>"
                + "<table><tr><th>Petitioner</th><td>State</td></tr><tr><th></th><td>versus</td></tr>"
                + "<tr><th>Respondent</th><td>Pawan Kumar</td></tr></table>Order not Uploded"
                + "<h2>Acts</h2><table><tr><th>Under Act(s)</th><th>Under Section(s)</th></tr>"
                + "<tr><td>Bharatiya Nagarik Suraksha Sanhita</td><td>497</td></tr></table></div>";

        ParsedCase p = PortalCaseParser.parse(html);

        assertTrue(p.found());
        assertEquals("DLCT020358762026", p.cnr());
        assertEquals("Misc Crl", p.caseType());
        assertEquals("Misc Crl/35875/2026", p.filingNumber());
        assertEquals(LocalDate.of(2026, 8, 14), p.filingDate());
        assertEquals("", p.establishment());
        assertEquals(List.of("State"), p.petitioners());
        assertEquals(List.of("Pawan Kumar"), p.respondents());
        assertEquals(List.of("Bharatiya Nagarik Suraksha Sanhita - Section 497"), p.acts());
        assertNull(p.nextHearing());
        assertFalse(p.disposed());
        assertEquals("Misc Crl/35875/2026", EcourtsCaseService.detailOf(p).caseNo());
    }
}
