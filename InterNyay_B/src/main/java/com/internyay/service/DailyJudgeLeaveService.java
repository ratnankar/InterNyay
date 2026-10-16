package com.internyay.service;

import com.internyay.scraper.DistrictLeaveUrls;
import com.internyay.service.JudgeLeaveScraperService.ScrapeResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

// Runs the leave scraper for every district court
@Slf4j
@Service
@RequiredArgsConstructor
public class DailyJudgeLeaveService {

    private final JudgeLeaveScraperService scraperService;
    private final CourtService courtService;

    // Stops two runs (hourly job, startup, admin button) from scraping at the same time
    private final AtomicBoolean running = new AtomicBoolean(false);

    // One result per district, a failure in one district doesn't stop the rest
    public List<ScrapeResult> scrapeAllDistricts() {

        List<ScrapeResult> results = new ArrayList<>();

        if (!running.compareAndSet(false, true)) {
            log.warn("Judges On Leave scraping is already running, skipping this run.");
            return results;
        }

        try {

            log.info("Starting Judges On Leave scraping...");

            for (DistrictLeaveUrls.DistrictInfo info : DistrictLeaveUrls.URLS) {

                String court = info.court();
                String district = info.district();
                String url = info.url();

                try {

                    // Only districts that are in the court table are scraped, saved under the table's spelling
                    var place = courtService.placeOf(court, district);
                    court = place.getCourt();
                    district = place.getDistrict();

                    log.info("Scraping Judges On Leave: {} / {} ({})", court, district, url);

                    ScrapeResult result = scraperService.scrapeDistrict(
                            court,
                            district,
                            url
                    );

                    results.add(result);

                    log.info("Successfully scraped: {} / {} (saved {}, skipped {})",
                            court, district, result.saved(), result.skipped());

                } catch (Exception e) {

                    results.add(ScrapeResult.failed(court, district, e.toString()));

                    log.error("Failed to scrape {} / {}: {}", court, district, e.getMessage(), e);
                }
            }

            log.info("Judges On Leave scraping completed.");

            return results;

        } finally {
            running.set(false);
        }
    }
}