package com.internyay.scraper;

import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Component
public class DelhiHighCourtCauseListClient {

    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
    private static final DateTimeFormatter TITLE_DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final Pattern PAGE_PARAM = Pattern.compile("[?&]page=(\\d+)");
    private static final Pattern SUPPLEMENT_NO = Pattern.compile("supplementary cause list\\s*-?\\s*(\\d+)");
    private static final List<String> EXCLUDED = List.of("deletion", "pronouncement", "notice", "registrar", "roster");

    public record CauseListDocument(String title, List<String> lines) {}

    private record Entry(String title, String url, int rank) {}

    private final String archiveUrl;
    private final int pagesBack;
    private final long maxPdfBytes;

    public DelhiHighCourtCauseListClient(
            @Value("${causelist.delhihc.archive-url:https://delhihighcourt.nic.in/web/cause-lists-archived}") String archiveUrl,
            @Value("${causelist.delhihc.pages-back:3}") int pagesBack,
            @Value("${causelist.delhihc.max-pdf-mb:60}") int maxPdfMb) {
        this.archiveUrl = archiveUrl;
        this.pagesBack = Math.max(1, pagesBack);
        this.maxPdfBytes = Math.max(1, maxPdfMb) * 1024L * 1024L;
    }

    public List<CauseListDocument> fetch(LocalDate hearingDate) {
        List<Entry> entries;

        try {
            entries = findEntries(hearingDate);
        } catch (IOException | RuntimeException e) {
            log.error("Delhi High Court cause list archive could not be read: {}", e.getMessage());
            return List.of();
        }

        if (entries.isEmpty()) {
            log.info("Delhi High Court: no cause list PDF published yet for {}", hearingDate);
            return List.of();
        }

        List<CauseListDocument> documents = new ArrayList<>();

        for (Entry entry : entries) {
            try {
                List<String> lines = extractLines(download(entry.url()));
                log.info("Delhi High Court: read '{}' ({} lines)", entry.title(), lines.size());
                documents.add(new CauseListDocument(entry.title(), lines));
            } catch (IOException | RuntimeException e) {
                log.error("Delhi High Court: could not read '{}': {}", entry.title(), e.getMessage());
            }
        }
        return documents;
    }

    private List<Entry> findEntries(LocalDate hearingDate) throws IOException {
        int lastPage = lastPage();
        String dateText = hearingDate.format(TITLE_DATE);
        List<Entry> entries = new ArrayList<>();

        for (int page = lastPage; page > lastPage - pagesBack && page >= 0; page--) {
            Document archive = open(archiveUrl + "?page=" + page);
            Elements rows = archive.select("table tbody tr");

            if (rows.isEmpty()) {
                rows = archive.select("table tr");
            }

            for (Element row : rows) {
                Elements cells = row.select("td");
                Element link = row.selectFirst("a[href~=(?i)\\.pdf$]");

                if (cells.size() < 3 || link == null) {
                    continue;
                }

                String title = cells.get(1).text().trim();

                if (!title.contains(dateText)) {
                    continue;
                }

                int rank = rank(title);

                if (rank >= 0) {
                    entries.add(new Entry(title, link.absUrl("href"), rank));
                }
            }
        }

        entries.sort(Comparator.comparingInt(Entry::rank));
        return entries;
    }

    private int lastPage() throws IOException {
        Document first = open(archiveUrl);
        Element last = first.selectFirst("a[title=\"Go to last page\"]");
        int max = -1;

        Elements links = last != null ? new Elements(last) : first.select("a[href*=page=]");

        for (Element link : links) {
            Matcher matcher = PAGE_PARAM.matcher(link.attr("href"));
            if (matcher.find()) {
                max = Math.max(max, Integer.parseInt(matcher.group(1)));
            }
        }

        if (max < 0) {
            throw new IOException("last page of the archive not found");
        }
        return max;
    }

    static int rank(String title) {
        String lower = title.toLowerCase(Locale.ROOT);

        if (!lower.contains("cause list")) {
            return -1;
        }

        for (String word : EXCLUDED) {
            if (lower.contains(word)) {
                return -1;
            }
        }

        if (lower.contains("supplementary")) {
            Matcher number = SUPPLEMENT_NO.matcher(lower);
            return 100 + (number.find() ? Integer.parseInt(number.group(1)) : 0);
        }

        if (lower.contains("cause list of sitting of benches")) {
            return 0;
        }
        return 50;
    }

    private Document open(String url) throws IOException {
        return Jsoup.connect(url).userAgent(USER_AGENT).timeout(30_000).get();
    }

    private byte[] download(String url) throws IOException {
        Connection.Response response = Jsoup.connect(url)
                .userAgent(USER_AGENT)
                .ignoreContentType(true)
                .maxBodySize(0)
                .timeout(180_000)
                .execute();

        byte[] body = response.bodyAsBytes();

        if (body.length > maxPdfBytes) {
            throw new IOException("PDF is larger than " + (maxPdfBytes / 1024 / 1024) + " MB");
        }
        return body;
    }

    private List<String> extractLines(byte[] pdf) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            return stripper.getText(document).lines().toList();
        }
    }
}
