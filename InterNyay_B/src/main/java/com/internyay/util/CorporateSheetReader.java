package com.internyay.util;

import com.internyay.service.EcourtsCaseService;
import org.apache.poi.openxml4j.exceptions.OpenXML4JException;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.util.XMLHelper;
import org.apache.poi.xssf.eventusermodel.ReadOnlySharedStringsTable;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.model.StylesTable;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.XMLReader;
import org.xml.sax.helpers.DefaultHandler;

import javax.xml.parsers.ParserConfigurationException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

// Reads the MIS spreadsheets (.xlsx) a corporate firm keeps its cases in (the Hero Fincorp NI 138 MIS and similar). Every sheet that
// has a CNR column is read (its header is found by name, because the sheets call it CNRNO, CRN NO or CRN NUMBER); the other sheets,
// like pivot tables, are left out. The sheet is streamed row by row, so a sheet with tens of thousands of rows stays light on memory.
public final class CorporateSheetReader {

    private CorporateSheetReader() {
    }

    // One case row. cnr is the normalized CNR number, null when the cell has none (blank, #N/A or a remark like "Case rejected in CIS")
    public record Row(String sheet, int rowNo, String rawCnr, String cnr, String ccNo, String court, String accused,
                      LocalDate nextDate, String status) {
        // A row of a disposed or withdrawn case
        public boolean closed() {
            if (status == null) return false;
            String s = status.toUpperCase(Locale.ROOT);
            return s.startsWith("DISPOS") || s.startsWith("WITHDRAW");
        }
    }

    public record Result(List<Row> rows, List<String> sheetsRead, List<String> sheetsLeftOut) {}

    private static final int MAX_ROWS = 200_000;
    // How many rows from the top are tried as the header row
    private static final int HEADER_SEARCH_ROWS = 10;
    // The names the sheets give the CNR column. An exact match, so a pivot table row like "CNR NO PENDING" is not taken for a header
    private static final Set<String> CNR_HEADERS = Set.of("CNR", "CNRNO", "CNRNUMBER", "CRN", "CRNNO", "CRNNUMBER");

    // Rows of every sheet with a CNR column. Throws IOException when the bytes are not an .xlsx workbook
    public static Result read(byte[] xlsx) throws IOException {
        List<Row> rows = new ArrayList<>();
        List<String> read = new ArrayList<>(), left = new ArrayList<>();
        try (OPCPackage pkg = OPCPackage.open(new ByteArrayInputStream(xlsx))) {
            XSSFReader reader = new XSSFReader(pkg);
            ReadOnlySharedStringsTable strings = new ReadOnlySharedStringsTable(pkg);
            StylesTable styles = reader.getStylesTable();
            XSSFReader.SheetIterator sheets = (XSSFReader.SheetIterator) reader.getSheetsData();
            while (sheets.hasNext()) {
                try (InputStream in = sheets.next()) {
                    SheetHandler handler = new SheetHandler(sheets.getSheetName(), strings, styles, rows);
                    XMLReader xml = XMLHelper.newXMLReader();
                    xml.setContentHandler(handler);
                    xml.parse(new InputSource(in));
                    (handler.hasCnrColumn() ? read : left).add(sheets.getSheetName());
                }
            }
        } catch (OpenXML4JException | SAXException | ParserConfigurationException e) {
            throw new IOException("Not a readable .xlsx workbook", e);
        } catch (IOException e) {
            throw e;
        } catch (RuntimeException e) {
            // An old .xls file, a password protected workbook or a corrupt file
            throw new IOException("Not a readable .xlsx workbook", e);
        }
        return new Result(rows, read, left);
    }

    // ----- Cell helpers -----

    private record Cell(String text, LocalDate date) {}

    // Header names compared without case, spaces or punctuation ("CCNo." and "CC NO" are the same)
    static String norm(String s) {
        return s == null ? "" : s.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    // Trimmed text, null for blanks and the placeholders the sheets use for "nothing" (#N/A, NA)
    static String clean(String s) {
        if (s == null) return null;
        String t = s.replace('\u00A0', ' ').replaceAll("\\s+", " ").trim();
        if (t.isEmpty() || t.equalsIgnoreCase("#N/A") || t.equalsIgnoreCase("N/A") || t.equalsIgnoreCase("NA")) return null;
        return t;
    }

    private static final DateTimeFormatter[] TEXT_DATES = {
            DateTimeFormatter.ofPattern("d.M.uuuu"), DateTimeFormatter.ofPattern("d-M-uuuu"),
            DateTimeFormatter.ofPattern("d/M/uuuu"), DateTimeFormatter.ISO_LOCAL_DATE};

    // A date written as text (11.03.2016); null when it is not one
    static LocalDate parseTextDate(String s) {
        if (s == null) return null;
        String t = s.trim();
        if (t.length() > 10) t = t.substring(0, 10);
        for (DateTimeFormatter f : TEXT_DATES) {
            try { return LocalDate.parse(t, f); } catch (RuntimeException ignored) { /* try the next format */ }
        }
        return null;
    }

    // A number written without an exponent or a trailing .0 (a numeric CC number 12471 stays 12471)
    private static String plainNumber(String raw) {
        try { return new BigDecimal(raw.trim()).stripTrailingZeros().toPlainString(); }
        catch (NumberFormatException e) { return raw; }
    }

    private static int columnIndex(String ref) {
        int col = 0;
        for (int i = 0; i < ref.length(); i++) {
            char c = ref.charAt(i);
            if (c < 'A' || c > 'Z') break;
            col = col * 26 + (c - 'A' + 1);
        }
        return col - 1;
    }

    // ----- One worksheet -----

    private static final class SheetHandler extends DefaultHandler {
        private final String sheetName;
        private final ReadOnlySharedStringsTable strings;
        private final StylesTable styles;
        private final List<Row> out;
        private final Map<Integer, Boolean> dateStyles = new HashMap<>();

        private Map<Integer, Cell> current = new HashMap<>();
        private int rowNo;
        private int lastRowNo;
        private String ref, type;
        private int style;
        private final StringBuilder text = new StringBuilder();
        private boolean capture;

        private boolean headerFound;
        private int headerTries;
        private int cnrCol = -1, ccCol = -1, courtCol = -1, accusedCol = -1, dateCol = -1, statusCol = -1, statusFallbackCol = -1;

        SheetHandler(String sheetName, ReadOnlySharedStringsTable strings, StylesTable styles, List<Row> out) {
            this.sheetName = sheetName;
            this.strings = strings;
            this.styles = styles;
            this.out = out;
        }

        boolean hasCnrColumn() { return headerFound; }

        @Override
        public void startElement(String uri, String localName, String qName, Attributes atts) {
            switch (localName) {
                case "row" -> {
                    current = new HashMap<>();
                    String r = atts.getValue("r");
                    rowNo = r == null ? lastRowNo + 1 : Integer.parseInt(r);
                    lastRowNo = rowNo;
                }
                case "c" -> {
                    ref = atts.getValue("r");
                    type = atts.getValue("t");
                    String s = atts.getValue("s");
                    style = s == null ? 0 : Integer.parseInt(s);
                    text.setLength(0);
                }
                case "v", "t" -> capture = true;
                default -> { }
            }
        }

        @Override
        public void characters(char[] ch, int start, int length) {
            if (capture) text.append(ch, start, length);
        }

        @Override
        public void endElement(String uri, String localName, String qName) throws SAXException {
            switch (localName) {
                case "v", "t" -> capture = false;
                case "c" -> endCell();
                case "row" -> endRow();
                default -> { }
            }
        }

        private void endCell() {
            if (ref == null) return;
            String raw = text.toString();
            Cell cell = null;
            if (type == null || type.equals("n")) {
                if (!raw.isBlank()) {
                    LocalDate date = isDateStyle(style) ? toDate(raw) : null;
                    cell = new Cell(date != null ? date.toString() : plainNumber(raw), date);
                }
            } else {
                switch (type) {
                    case "s" -> {
                        try { cell = new Cell(strings.getItemAt(Integer.parseInt(raw.trim())).getString(), null); }
                        catch (RuntimeException e) { /* a bad shared string index leaves the cell empty */ }
                    }
                    case "str", "inlineStr" -> cell = new Cell(raw, null);
                    case "b" -> cell = new Cell("1".equals(raw.trim()) ? "TRUE" : "FALSE", null);
                    case "d" -> cell = new Cell(raw, parseTextDate(raw));
                    default -> { }   // "e" (an error value) counts as empty
                }
            }
            if (cell != null) current.put(columnIndex(ref), cell);
            ref = null;
        }

        private boolean isDateStyle(int idx) {
            return dateStyles.computeIfAbsent(idx, i -> {
                try {
                    XSSFCellStyle st = styles.getStyleAt(i);
                    return DateUtil.isADateFormat(st.getDataFormat(), st.getDataFormatString());
                } catch (RuntimeException e) {
                    return false;
                }
            });
        }

        private static LocalDate toDate(String raw) {
            try { return DateUtil.getLocalDateTime(Double.parseDouble(raw.trim())).toLocalDate(); }
            catch (RuntimeException e) { return null; }
        }

        private String textAt(int col) {
            Cell c = col < 0 ? null : current.get(col);
            return c == null ? null : clean(c.text());
        }

        private LocalDate dateAt(int col) {
            Cell c = col < 0 ? null : current.get(col);
            if (c == null) return null;
            return c.date() != null ? c.date() : parseTextDate(clean(c.text()));
        }

        private void endRow() throws SAXException {
            if (current.isEmpty()) return;
            if (!headerFound) {
                if (headerTries++ >= HEADER_SEARCH_ROWS) return;
                findHeader();
                return;
            }
            String raw = textAt(cnrCol);
            String cc = textAt(ccCol);
            String accused = textAt(accusedCol);
            // A row with no CNR, no case number and no party is spacing or a total line, not a case
            if (raw == null && cc == null && accused == null) return;
            if (out.size() >= MAX_ROWS) throw new SAXException("The spreadsheet has more than " + MAX_ROWS + " rows");
            String status = textAt(statusCol);
            if (status == null) status = textAt(statusFallbackCol);
            out.add(new Row(sheetName, rowNo, raw, EcourtsCaseService.normalizeCnr(raw), cc, textAt(courtCol), accused,
                    dateAt(dateCol), status));
        }

        // The header row is the first of the top rows that names a CNR column
        private void findHeader() {
            int cnr = -1, cc = -1, court = -1, accused = -1, date = -1, status = -1, fallback = -1;
            for (Map.Entry<Integer, Cell> e : current.entrySet()) {
                String n = norm(e.getValue().text());
                int col = e.getKey();
                if (cnr < 0 && CNR_HEADERS.contains(n)) cnr = col;
                else if (cc < 0 && n.startsWith("CCNO")) cc = col;
                else if (court < 0 && (n.equals("COURTNAME") || n.equals("COURTLOCATION"))) court = col;
                else if (accused < 0 && (n.equals("CUSTOMERACCUSED") || n.equals("NAMEOFTHECUSTOMER"))) accused = col;
                else if (date < 0 && n.equals("NDOH")) date = col;
                else if (status < 0 && (n.equals("LIVEDISPOSEDOFF") || n.equals("LIVEWITHDRAWN") || n.equals("LIVEDISPOSED"))) status = col;
                else if (fallback < 0 && n.equals("CASECURRENTSTATUS")) fallback = col;
            }
            if (cnr < 0) return;
            headerFound = true;
            cnrCol = cnr; ccCol = cc; courtCol = court; accusedCol = accused; dateCol = date;
            statusCol = status; statusFallbackCol = fallback;
        }
    }
}
