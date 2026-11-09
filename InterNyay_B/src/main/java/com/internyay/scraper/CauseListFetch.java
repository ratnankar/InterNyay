package com.internyay.scraper;

import com.internyay.scraper.DelhiHighCourtCauseListClient.CauseListDocument;

import java.util.List;

public record CauseListFetch(List<CauseListDocument> documents, boolean complete) {

    public static CauseListFetch nothingPublished() {
        return new CauseListFetch(List.of(), true);
    }
}
