package com.internyay.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.internyay.scraper.PortalCaseParser.HistoryRow;
import com.internyay.scraper.PortalCaseParser.OrderRow;
import com.internyay.scraper.PortalCaseParser.ParsedCase;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;

// What the app knows about a case from eCourts: the shapes it is handed around in (CaseDetail for the Add Case form,
// Snapshot for the hearing and order history) and the conversion from the case page read off the eCourts Services
// portal (see CnrLookupService). The paid eCourts API is no longer used anywhere; orders for later hearing dates are
// looked up on the portal by ScrapingService when a hearing date is set or moved
@Service
public class EcourtsCaseService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final Pattern CNR_FORMAT = Pattern.compile("[A-Z0-9]{16}");

    // What eCourts says about one case
    //  hearings   - every date the case was heard (up to today) with the judge, oldest first
    //  orderFiles - order date to the file name of its order (order-N.pdf, judgment-N.pdf), interim orders and judgments
    public record Snapshot(
            String caseStatus,
            String disposalType,
            LocalDate nextHearing,
            LocalDate decisionDate,
            TreeMap<LocalDate, String> hearings,
            Map<LocalDate, String> orderFiles) {

        public boolean disposed() { return "DISPOSED".equalsIgnoreCase(caseStatus); }

        public boolean withdrawn() {
            return disposalType != null && disposalType.toUpperCase(Locale.ROOT).contains("WITHDRAWN");
        }
    }

    // What eCourts says about one case, in the words of the Add Case form. Used to fill the form when a
    // case is added by CNR. Dates are ISO text (yyyy-MM-dd), anything eCourts does not give is empty
    //  status      - Pending, Decided or Withdrawn, as the app names them
    //  courtName   - the court as eCourts names it, the app matches it to its own court table
    //  hearingCount / orderCount - how much history will be brought in when the case is saved
    public record CaseDetail(
            String cnr,
            String caseNo,
            String filingDate,
            String status,
            String nextHearing,
            String caseNature,
            String caseType,
            String courtName,
            String state,
            String district,
            String courtNo,
            String judge,
            List<String> petitioners,
            List<String> respondents,
            List<String> petitionerAdvocates,
            List<String> respondentAdvocates,
            String firNo,
            String policeStation,
            int hearingCount,
            int orderCount,
            String caseStage,
            String actsSections,
            String registrationDate,
            String firstHearingDate,
            String efilingNo,
            String decisionDate,
            String disposalNature) {}

    // The case page of the portal as the Add Case form wants it
    public static CaseDetail detailOf(ParsedCase p) {

        Snapshot snap = snapshotOf(p);

        String status = "Pending";
        String nextHearing = snap.nextHearing() == null ? null : snap.nextHearing().toString();
        if (snap.disposed()) {
            status = snap.withdrawn() ? "Withdrawn" : "Decided";
            nextHearing = null;
        }

        // "CC NI ACT - Complaint Case 138 NI Act" is the case type; the short form before the dash starts the case number
        String typeRaw = p.caseType() == null ? "" : p.caseType().trim();
        String typeShort = typeRaw.contains(" - ") ? typeRaw.substring(0, typeRaw.indexOf(" - ")).trim() : typeRaw;
        String regNo = p.registrationNumber() == null ? "" : p.registrationNumber().trim();
        String caseNo = !regNo.isEmpty()
                ? (typeShort.isEmpty() ? regNo : typeShort + " " + regNo)
                : (p.filingNumber() == null ? "" : p.filingNumber().trim());

        boolean hasFir = !p.firNo().isEmpty() || !p.policeStation().isEmpty();

        return new CaseDetail(
                p.cnr(),
                caseNo,
                p.filingDate() == null ? null : p.filingDate().toString(),
                status,
                nextHearing,
                natureOf(typeRaw + " " + String.join(" ", p.acts()), hasFir),
                typeShort,
                p.establishment(),
                "",
                "",
                p.courtNo(),
                p.judge(),
                p.petitioners(),
                p.respondents(),
                p.petitionerAdvocates(),
                p.respondentAdvocates(),
                p.firNo(),
                p.policeStation(),
                snap.hearings().size(),
                snap.orderFiles().size(),
                nz(p.stage()),
                String.join("; ", p.acts()),
                iso(p.registrationDate()),
                iso(p.firstHearing()),
                nz(p.efilingNumber()),
                iso(p.decisionDate()),
                nz(p.natureOfDisposal()));
    }

    private static String nz(String s) { return s == null ? "" : s.trim(); }

    private static String iso(LocalDate d) { return d == null ? "" : d.toString(); }

    // Hearing and order history of the case page
    public static Snapshot snapshotOf(ParsedCase p) {

        LocalDate today = LocalDate.now(IST);

        // Dates the case was heard: the "business on" date of every history row, plus every order date
        TreeMap<LocalDate, String> hearings = new TreeMap<>();
        for (HistoryRow row : p.history()) {
            LocalDate d = row.businessOn();
            if (d != null && !d.isAfter(today)) {
                hearings.merge(d, row.judge() == null ? "" : row.judge().trim(), (a, b) -> a.isBlank() ? b : a);
            }
        }

        // The first order of a date is the one a hearing keeps
        Map<LocalDate, String> orderFiles = new TreeMap<>();
        for (OrderRow o : p.orders()) {
            if (o.date() != null) orderFiles.putIfAbsent(o.date(), o.fileName());
        }
        orderFiles.keySet().stream().filter(d -> !d.isAfter(today)).forEach(d -> hearings.putIfAbsent(d, ""));

        return new Snapshot(
                p.disposed() ? "DISPOSED" : "PENDING",
                p.natureOfDisposal(),
                p.nextHearing(),
                p.decisionDate(),
                hearings,
                orderFiles);
    }

    // Words that put a case on the criminal side, and words that put it on the civil side
    private static final Pattern CRIMINAL_WORDS = Pattern.compile(
            "criminal|\\bcrl\\b|\\bcr\\.?\\s?p\\.?\\s?c\\b|\\bbnss?\\b|suraksha sanhita|nyaya sanhita|\\bbns\\b|\\bipc\\b|\\bbail\\b|challan|sessions|police|\\bfir\\b"
          + "|\\bni act\\b|negotiable instruments?|\\bcheque\\b");
    private static final Pattern CIVIL_WORDS = Pattern.compile(
            "civil|\\bcs\\b|matrimon|family|divorce|custody|injunction|consumer|commercial|recovery|"
          + "partition|\\btenan|\\brent\\b|eviction|probate|succession|arbitration|\\bexecution|motor accident|\\bmacp?\\b");

    // Criminal, Civil, or empty when eCourts gives nothing to tell. Looks at the case type and act names and the FIR;
    // an empty answer is better than a wrong "Civil", the Add Case form then asks the advocate
    static String natureOf(String caseTypeText, boolean hasFir) {
        String hay = String.valueOf(caseTypeText).toLowerCase(Locale.ROOT);

        boolean criminal = CRIMINAL_WORDS.matcher(hay).find();
        boolean civil = CIVIL_WORDS.matcher(hay).find();
        if (criminal && !civil) return "Criminal";
        if (civil && !criminal) return "Civil";

        // A case with an FIR is a criminal case
        if (hasFir) return "Criminal";

        return criminal ? "Criminal" : "";
    }

    // Upper case, no spaces or dashes, null when invalid
    public static String normalizeCnr(String raw) {
        if (raw == null) return null;
        String cnr = raw.trim().toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
        return CNR_FORMAT.matcher(cnr).matches() ? cnr : null;
    }

    // Takes the date part of an ISO date or date-time string
    private static LocalDate parseDate(String text) {
        if (text == null || text.length() < 10) return null;
        try {
            return LocalDate.parse(text.substring(0, 10));
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
