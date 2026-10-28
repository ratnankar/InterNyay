package com.internyay.scraper;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Reads the case page of the eCourts Services portal ("Case Details", "Case Status", parties, acts, "Case History",
// "Interim Orders"...) into a ParsedCase.
//
// The page is first turned into lines of text, one table row or block per line and a tab between cells, which is
// what copying the page gives. The sections are then read from that text, so a change in the portal's markup
// (class names, nesting) does not matter as long as the labels stay. Only the links of the orders are read from the HTML.
public final class PortalCaseParser {

    private PortalCaseParser() {}

    public record HistoryRow(String judge, LocalDate businessOn, LocalDate hearingDate, String purpose) {}

    // number: the order number the portal prints; link: the argument of the row's displayPdf('...') call, or null
    public record OrderRow(String kind, int number, LocalDate date, String link) {
        public String fileName() { return ("FINAL".equals(kind) ? "judgment-" : "order-") + number + ".pdf"; }
    }

    public record ParsedCase(
            String establishment,
            String caseType,
            String filingNumber,
            LocalDate filingDate,
            String registrationNumber,
            LocalDate registrationDate,
            String efilingNumber,
            String cnr,
            LocalDate firstHearing,
            LocalDate nextHearing,
            String stage,
            String courtNo,
            String judge,
            List<String> petitioners,
            List<String> petitionerAdvocates,
            List<String> respondents,
            List<String> respondentAdvocates,
            List<String> acts,
            String firNo,
            String policeStation,
            LocalDate decisionDate,
            String natureOfDisposal,
            boolean disposed,
            List<HistoryRow> history,
            List<OrderRow> orders) {

        // True when the page really was a case page
        public boolean found() { return cnr != null && !cnr.isEmpty() && (caseType != null && !caseType.isEmpty()); }
    }

    private static final Pattern DATE = Pattern.compile("\\b(\\d{2})-(\\d{2})-(\\d{4})\\b");
    private static final Pattern LONG_DATE = Pattern.compile("(\\d{1,2})(?:st|nd|rd|th)?\\s+([A-Za-z]+)\\s+(\\d{4})");
    private static final Pattern CNR = Pattern.compile("\\b[A-Z]{4}\\d{12}\\b");
    private static final Pattern DISPLAY_PDF = Pattern.compile("displayPdf\\(((?:'[^']*'|\"[^\"]*\"|[^)'\"])*)\\)");
    private static final Pattern QUOTED = Pattern.compile("'([^']*)'|\"([^\"]*)\"");
    // The portal's displayPdf(normal_v, case_val, court_code, filename, appFlag) fields, in call order
    private static final String[] PDF_FIELDS = {"normal_v", "case_val", "court_code", "filename", "appFlag"};
    private static final DateTimeFormatter LONG = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);

    // Headings that start a new section of the page
    private static final Pattern SECTION = Pattern.compile(
            "^(Case Details|Case Status|Petitioner and Advocate|Respondent and Advocate|Acts|FIR Details|Case History|"
          + "Interim Orders|Final Orders(?: and Judgements?)?|Orders?|Process Details|Case Transfer Details|"
          + "Subordinate Court Information|Objections|Link Cases|IA Details)\\s*$", Pattern.CASE_INSENSITIVE);

    public static ParsedCase parse(String html) {
        org.jsoup.nodes.Document doc = Jsoup.parse(html == null ? "" : html);
        List<String> lines = lines(doc.body());
        return fromLines(lines, orderLinks(doc));
    }

    // Same, from text lines already made (used by the tests with a copy of the page)
    public static ParsedCase fromLines(List<String> lines, List<OrderRow> linked) {

        String text = String.join("\n", lines);

        // The court is the line above "Case Details"
        String establishment = "";
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).trim().equalsIgnoreCase("Case Details")) {
                for (int k = i - 1; k >= 0; k--) {
                    if (!lines.get(k).isBlank()) { establishment = lines.get(k).trim(); break; }
                }
                break;
            }
        }

        String caseType = value(text, "Case Type");
        String filingNumber = value(text, "Filing Number");
        LocalDate filingDate = shortDate(value(text, "Filing Date"));
        String registrationNumber = value(text, "Registration Number");
        LocalDate registrationDate = shortDate(value(text, "Registration Date"));

        String efilingNumber = value(text, "e-Filing Number");

        Matcher cnrMatcher = CNR.matcher(value(text, "CNR Number").toUpperCase(Locale.ROOT));
        String cnr = cnrMatcher.find() ? cnrMatcher.group() : "";
        if (cnr.isEmpty()) {
            Matcher any = CNR.matcher(text.toUpperCase(Locale.ROOT));
            if (any.find()) cnr = any.group();
        }

        LocalDate firstHearing = longDate(value(text, "First Hearing Date"));
        LocalDate nextHearing = longDate(value(text, "Next Hearing Date"));
        String stage = value(text, "Case Stage");

        // "785-Judicial Magistrate First Class (NI Act)-08": the court room number, then the judge. Family courts write the room
        // with a letter prefix ("FC-3-Judge Family Court"), which is part of the court room number
        String courtNoJudge = value(text, "Court Number and Judge");
        String courtNo = "";
        String judge = courtNoJudge;
        Matcher room = Pattern.compile("^\\s*((?:[A-Za-z]{1,3}\\s*-\\s*)?\\d+[A-Za-z]?)\\s*-\\s*(.+)$").matcher(courtNoJudge);
        if (room.find()) { courtNo = room.group(1); judge = room.group(2).trim(); }

        // Decision: only a decided case shows these
        LocalDate decisionDate = longDate(value(text, "Decision Date"));
        if (decisionDate == null) decisionDate = shortDate(value(text, "Decision Date"));
        String disposal = value(text, "Nature of Disposal");
        boolean disposed = !disposal.isEmpty() || decisionDate != null
                || Pattern.compile("case\\s+disposed", Pattern.CASE_INSENSITIVE).matcher(text).find();

        List<String> petitioners = new ArrayList<>();
        List<String> petitionerAdvocates = new ArrayList<>();
        parties(section(lines, "Petitioner and Advocate"), petitioners, petitionerAdvocates);

        List<String> respondents = new ArrayList<>();
        List<String> respondentAdvocates = new ArrayList<>();
        parties(section(lines, "Respondent and Advocate"), respondents, respondentAdvocates);

        // Acts: "Negotiable Instruments Act <tab> 138" under the header row
        List<String> acts = new ArrayList<>();
        for (String row : section(lines, "Acts")) {
            String[] cells = cells(row);
            if (cells.length == 0 || cells[0].toLowerCase(Locale.ROOT).startsWith("under act")) continue;
            acts.add(cells.length > 1 ? cells[0] + " - Section " + cells[1] : cells[0]);
        }

        List<String> fir = section(lines, "FIR Details");
        String firText = String.join("\n", fir);
        String firNumber = value(firText, "FIR Number");
        String firYear = value(firText, "Year");
        String firNo = firNumber.isEmpty() ? "" : (firYear.isEmpty() ? firNumber : firNumber + "/" + firYear);
        String policeStation = value(firText, "Police Station");

        // Case history: judge, business on date, hearing date, purpose
        List<HistoryRow> history = new ArrayList<>();
        for (String row : section(lines, "Case History")) {
            String[] cells = cells(row);
            if (cells.length < 3) continue;
            LocalDate business = shortDate(cells[1]);
            if (business == null) continue;
            history.add(new HistoryRow(cells[0], business, shortDate(cells[2]), cells.length > 3 ? cells[3] : ""));
        }

        // Orders: the links come from the HTML; the rows of the text fill in orders that have no link
        List<OrderRow> orders = new ArrayList<>(linked);
        if (orders.isEmpty()) {
            orders.addAll(orderRows(section(lines, "Interim Orders"), "INTERIM"));
            orders.addAll(orderRows(sectionMatching(lines, "^Final Orders.*"), "FINAL"));
        }

        return new ParsedCase(establishment, caseType, filingNumber, filingDate, registrationNumber, registrationDate,
                efilingNumber, cnr, firstHearing, nextHearing, stage, courtNo, judge,
                petitioners, petitionerAdvocates, respondents, respondentAdvocates, acts,
                firNo, policeStation, decisionDate, disposal, disposed, history, orders);
    }

    // ---- HTML to lines ------------------------------------------------------------------------------------------

    private static final List<String> BLOCKS = List.of(
            "div", "p", "tr", "table", "li", "ul", "ol", "section", "h1", "h2", "h3", "h4", "h5", "h6", "br", "center", "form", "thead", "tbody");

    static List<String> lines(Element root) {
        StringBuilder sb = new StringBuilder();
        walk(root, sb);
        List<String> out = new ArrayList<>();
        for (String raw : sb.toString().split("\n")) {
            String line = raw.replace(' ', ' ').replaceAll("[ \\r\\f]+", " ").replaceAll(" ?\t ?", "\t").strip();
            line = line.replaceAll("^\t+|\t+$", "").replaceAll("\t{2,}", "\t");
            if (!line.isEmpty()) out.add(line);
        }
        return out;
    }

    private static void walk(Node node, StringBuilder sb) {
        if (node instanceof TextNode t) {
            sb.append(t.text());
            return;
        }
        if (!(node instanceof Element e)) return;
        String tag = e.tagName();
        if (tag.equals("script") || tag.equals("style")) return;

        boolean block = BLOCKS.contains(tag);
        boolean cell = tag.equals("td") || tag.equals("th");
        if (block) sb.append('\n');
        if (cell) sb.append('\t');
        for (Node child : e.childNodes()) walk(child, sb);
        if (cell) sb.append('\t');
        if (block) sb.append('\n');
    }

    // ---- links of the orders ------------------------------------------------------------------------------------

    // Order rows that have a "copy of order" link, in page order
    private static List<OrderRow> orderLinks(org.jsoup.nodes.Document doc) {
        List<OrderRow> out = new ArrayList<>();
        for (Element table : doc.select("table")) {
            if (!table.text().toLowerCase(Locale.ROOT).contains("order number")) continue;

            // Judgments and final orders sit under their own heading
            String before = "";
            Element prev = table.previousElementSibling();
            for (int i = 0; i < 3 && prev != null; i++, prev = prev.previousElementSibling()) before += " " + prev.text();
            String kind = Pattern.compile("final|judg", Pattern.CASE_INSENSITIVE).matcher(before.length() > 160 ? before.substring(0, 160) : before).find()
                    && !before.toLowerCase(Locale.ROOT).contains("interim") ? "FINAL" : "INTERIM";

            for (Element row : table.select("tr")) {
                String rowText = row.text();
                Matcher number = Pattern.compile("^\\s*(\\d+)\\b").matcher(row.select("td").isEmpty() ? "" : row.select("td").first().text());
                Matcher date = DATE.matcher(rowText);
                if (!number.find() || !date.find()) continue;

                String link = null;
                for (Element a : row.select("a")) {
                    Matcher m = DISPLAY_PDF.matcher(a.attr("onclick") + " " + a.attr("href"));
                    if (m.find()) { link = pdfLink(m.group(1)); break; }
                }
                out.add(new OrderRow(kind, Integer.parseInt(number.group(1)), shortDate(date.group()), link));
            }
        }
        return out;
    }

    // The argument of an order link as the query string orderPdf() posts. Older pages call displayPdf('a=1&b=2') with the
    // query string itself; the current page calls displayPdf('normal_v', 'case_val', 'court_code', 'filename', 'appFlag')
    static String pdfLink(String arguments) {
        List<String> args = new ArrayList<>();
        Matcher q = QUOTED.matcher(arguments);
        while (q.find()) args.add(q.group(1) != null ? q.group(1) : q.group(2));
        if (args.isEmpty()) return null;
        if (args.size() == 1) return args.get(0);

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < args.size() && i < PDF_FIELDS.length; i++) {
            if (i > 0) sb.append('&');
            sb.append(PDF_FIELDS[i]).append('=').append(java.net.URLEncoder.encode(args.get(i), java.nio.charset.StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    // Order rows from text: "1 <tab> 01-08-2023 <tab> COPY OF ORDER"
    private static List<OrderRow> orderRows(List<String> rows, String kind) {
        List<OrderRow> out = new ArrayList<>();
        for (String row : rows) {
            String[] cells = cells(row);
            if (cells.length < 2 || !cells[0].matches("\\d+")) continue;
            LocalDate d = shortDate(cells[1]);
            if (d != null) out.add(new OrderRow(kind, Integer.parseInt(cells[0]), d, null));
        }
        return out;
    }

    // ---- text helpers -------------------------------------------------------------------------------------------

    private static String[] cells(String row) {
        List<String> out = new ArrayList<>();
        for (String c : row.split("\t")) {
            String t = c.strip();
            if (!t.isEmpty()) out.add(t);
        }
        return out.toArray(new String[0]);
    }

    // The lines of a section: after its heading, up to the next heading
    private static List<String> section(List<String> lines, String heading) {
        return sectionMatching(lines, "^" + Pattern.quote(heading) + "$");
    }

    private static List<String> sectionMatching(List<String> lines, String headingRegex) {
        Pattern start = Pattern.compile(headingRegex, Pattern.CASE_INSENSITIVE);
        List<String> out = new ArrayList<>();
        boolean in = false;
        for (String line : lines) {
            String t = line.strip();
            if (!in) { if (start.matcher(t).matches()) in = true; continue; }
            if (SECTION.matcher(t).matches()) break;
            out.add(line);
        }
        return out;
    }

    // "Label <tab> value" or "Label: value" anywhere in the text; the value runs to the next tab or the line end
    private static String value(String text, String label) {
        Pattern p = Pattern.compile("(?:^|[\\t\\n])\\s*" + Pattern.quote(label) + "\\s*:?\\s*[\\t ]\\s*([^\\t\\n]*)", Pattern.CASE_INSENSITIVE);
        Matcher m = p.matcher(text);
        while (m.find()) {
            String v = m.group(1).strip().replaceFirst("^:\\s*", "");
            if (!v.isEmpty()) return v;
        }
        return "";
    }

    // "1) NAME" lines are the parties, "Advocate- NAME" lines the advocates
    private static void parties(List<String> rows, List<String> names, List<String> advocates) {
        for (String row : rows) {
            String line = row.replace('\t', ' ').strip();
            Matcher adv = Pattern.compile("^Advocate\\s*[-:]\\s*(.+)$", Pattern.CASE_INSENSITIVE).matcher(line);
            if (adv.find()) { addUnique(advocates, adv.group(1)); continue; }
            Matcher party = Pattern.compile("^\\d+\\)\\s*(.+)$").matcher(line);
            if (party.find()) { addUnique(names, party.group(1)); continue; }
            // A name given without a number
            if (names.isEmpty() && !line.isEmpty()) addUnique(names, line);
        }
    }

    private static void addUnique(List<String> list, String value) {
        String v = value.strip();
        if (!v.isEmpty() && !list.contains(v)) list.add(v);
    }

    private static LocalDate shortDate(String text) {
        if (text == null) return null;
        Matcher m = DATE.matcher(text);
        if (!m.find()) return null;
        try {
            return LocalDate.of(Integer.parseInt(m.group(3)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(1)));
        } catch (java.time.DateTimeException e) {
            return null;
        }
    }

    // "07th December 2026"
    private static LocalDate longDate(String text) {
        if (text == null || text.isBlank()) return null;
        Matcher m = LONG_DATE.matcher(text);
        if (m.find()) {
            try {
                return LocalDate.parse(Integer.parseInt(m.group(1)) + " " + capitalise(m.group(2)) + " " + m.group(3), LONG);
            } catch (DateTimeParseException ignored) {
                // fall through to the numeric form
            }
        }
        return shortDate(text);
    }

    private static String capitalise(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1).toLowerCase(Locale.ROOT);
    }
}
