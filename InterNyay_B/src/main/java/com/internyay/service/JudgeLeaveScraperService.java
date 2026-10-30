package com.internyay.service;

import com.internyay.entity.JudgeOnLeave;
import com.internyay.repository.JudgeOnLeaveRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

// Scrapes the district court websites for judges on leave
@Slf4j
@Service
@RequiredArgsConstructor
public class JudgeLeaveScraperService {

    private final JudgeOnLeaveRepository repository;

    // Outcome for one district: how many entries were found or the error
    public record ScrapeResult(
            String court,
            String district,
            int tableRows,
            int saved,
            int skipped,
            String firstSkipped,
            String error
    ) {
        // Result for a district that could not be scraped, with the error and zero counts
        public static ScrapeResult failed(String court, String district, String error) {
            return new ScrapeResult(court, district, 0, 0, 0, null, error);
        }
    }

    @Transactional
    public ScrapeResult scrapeDistrict(
            String court,
            String district,
            String url
    ) throws IOException {

        log.info("Opening URL: {}", url);

        Document document = Jsoup.connect(url)
                .userAgent(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                                "Chrome/140.0 Safari/537.36"
                )
                .timeout(30_000)
                .get();

        Elements rows = document.select("table tbody tr");

        if (rows.isEmpty()) {
            rows = document.select("table tr");
        }

        log.info("Rows found for {} / {}: {}", court, district, rows.size());

        int saved = 0;
        int skipped = 0;
        String firstSkipped = null;

        for (Element row : rows) {

            Elements cells = row.select("td");

            if (cells.isEmpty()) {
                continue;
            }

            if (cells.size() < 5) {

                skipped++;
                if (firstSkipped == null) {
                    firstSkipped = cells.size() + " column(s): " + row.text();
                }

                continue;
            }

            String name = cells.get(1).text().trim();
            String leaveFromText = cells.get(2).text().trim();
            String leaveToText = cells.get(3).text().trim();
            String reason = cells.get(4).text().trim();

            if (name.isBlank()) {

                skipped++;
                if (firstSkipped == null) {
                    firstSkipped = "blank name: " + row.text();
                }

                continue;
            }

            LocalDate leaveFrom = parseDate(leaveFromText);
            LocalDate leaveTo = parseDate(leaveToText);

            if (leaveFrom == null || leaveTo == null) {

                log.warn("Skipping invalid date for judge: {} | From: {} | To: {}",
                        name, leaveFromText, leaveToText);

                skipped++;
                if (firstSkipped == null) {
                    firstSkipped = "unreadable date: " + row.text();
                }

                continue;
            }

            JudgeOnLeave judge =
                    repository
                            .findFirstByNameAndCourtAndDistrictAndLeaveFromAndLeaveTo(
                                    name,
                                    court,
                                    district,
                                    leaveFrom,
                                    leaveTo
                            )
                            .orElse(
                                    JudgeOnLeave.builder()
                                            .name(name)
                                            .court(court)
                                            .district(district)
                                            .leaveFrom(leaveFrom)
                                            .leaveTo(leaveTo)
                                            .reason(reason)
                                            .build()
                            );

            judge.setName(name);
            judge.setCourt(court);
            judge.setDistrict(district);
            judge.setLeaveFrom(leaveFrom);
            judge.setLeaveTo(leaveTo);
            if (judge.getId() != null && !java.util.Objects.equals(judge.getReason(), reason)) {
                judge.setUpdatedAt(java.time.LocalDateTime.now());
            }
            judge.setReason(reason);
            judge.setLastScrapedAt(java.time.LocalDateTime.now());

            repository.save(judge);
            saved++;

            log.debug("Saved: {} | {} | {}", name, court, district);
        }

        return new ScrapeResult(court, district, rows.size(), saved, skipped, firstSkipped, null);
    }

    // Court pages use different date formats, each one is tried
    private LocalDate parseDate(String value) {

        List<DateTimeFormatter> formats = List.of(

                DateTimeFormatter.ofPattern("dd/MM/yyyy"),
                DateTimeFormatter.ofPattern("dd-MM-yyyy"),
                DateTimeFormatter.ofPattern("dd.MM.yyyy"),

                DateTimeFormatter.ofPattern("d/M/yyyy"),
                DateTimeFormatter.ofPattern("d-M-yyyy"),
                DateTimeFormatter.ofPattern("d.M.yyyy")
        );

        for (DateTimeFormatter formatter : formats) {

            try {
                return LocalDate.parse(value, formatter);

            } catch (Exception ignored) {
                // not this date format: try the next one
            }
        }

        return null;
    }
}
