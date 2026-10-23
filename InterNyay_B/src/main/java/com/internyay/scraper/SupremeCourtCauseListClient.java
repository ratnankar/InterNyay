package com.internyay.scraper;

import com.internyay.scraper.DelhiHighCourtCauseListClient.CauseListDocument;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

// Downloads the Supreme Court of India daily cause list PDFs.
// The court publishes them at a dated address, e.g. {base-url}2026-10-12/M_J_2.pdf, where M_J_ is the main list
// and M_S_ the supplementary list, followed by a running number. Which numbers exist differs from day to day, so
// every number up to max-files is tried and a missing file is simply skipped.
@Slf4j
@Component
public class SupremeCourtCauseListClient {

    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
    private static final DateTimeFormatter PATH_DATE = DateTimeFormatter.ISO_LOCAL_DATE;
    // Stop looking for more files of one kind after this many missing ones in a row
    private static final int MAX_MISSES_IN_A_ROW = 2;

    private final String baseUrl;
    private final List<String> prefixes;
    private final int maxFiles;
    private final long maxPdfBytes;

    public SupremeCourtCauseListClient(
            @Value("${causelist.sci.base-url:https://api.sci.gov.in/jonew/cl/}") String baseUrl,
            @Value("${causelist.sci.file-prefixes:M_J_,M_S_}") String filePrefixes,
            @Value("${causelist.sci.max-files:6}") int maxFiles,
            @Value("${causelist.sci.max-pdf-mb:60}") int maxPdfMb) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        this.prefixes = Arrays.stream(filePrefixes.split(","))
                .map(String::trim)
                .filter(p -> !p.isEmpty())
                .toList();
        this.maxFiles = Math.max(1, maxFiles);
        this.maxPdfBytes = Math.max(1, maxPdfMb) * 1024L * 1024L;
    }

    // The cause list PDFs of a date, main list first, then the supplementary lists. Empty while nothing is published
    public List<CauseListDocument> fetch(LocalDate hearingDate) {
        List<CauseListDocument> documents = new ArrayList<>();
        String folder = baseUrl + hearingDate.format(PATH_DATE) + "/";

        for (String prefix : prefixes) {
            int misses = 0;

            for (int number = 1; number <= maxFiles && misses < MAX_MISSES_IN_A_ROW; number++) {
                String name = prefix + number;

                try {
                    byte[] pdf = download(folder + name + ".pdf");

                    if (pdf == null) {
                        misses++;
                        continue;
                    }

                    misses = 0;
                    List<String> lines = extractLines(pdf);
                    log.info("Supreme Court: read '{}' ({} lines)", name, lines.size());
                    documents.add(new CauseListDocument(name, lines));

                } catch (IOException | RuntimeException e) {
                    log.error("Supreme Court: could not read '{}': {}", name, e.getMessage());
                }
            }
        }

        if (documents.isEmpty()) {
            log.info("Supreme Court: no cause list PDF published yet for {}", hearingDate);
        }
        return documents;
    }

    // Null when the file does not exist (or is not a PDF), which is normal for numbers that are not published
    private byte[] download(String url) throws IOException {
        Connection.Response response = Jsoup.connect(url)
                .userAgent(USER_AGENT)
                .referrer("https://www.sci.gov.in/")
                .ignoreContentType(true)
                .ignoreHttpErrors(true)
                .maxBodySize(0)
                .timeout(120_000)
                .execute();

        if (response.statusCode() != 200) {
            return null;
        }

        byte[] body = response.bodyAsBytes();

        if (body.length > maxPdfBytes) {
            throw new IOException("PDF is larger than " + (maxPdfBytes / 1024 / 1024) + " MB");
        }

        // The site can answer 200 with an HTML error page
        boolean pdf = body.length > 4 && body[0] == '%' && body[1] == 'P' && body[2] == 'D' && body[3] == 'F';
        return pdf ? body : null;
    }

    private List<String> extractLines(byte[] pdf) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            return stripper.getText(document).lines().toList();
        }
    }
}
