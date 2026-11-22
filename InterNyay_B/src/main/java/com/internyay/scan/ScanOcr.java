package com.internyay.scan;

import java.util.List;

public record ScanOcr(String language, Double confidence, String text, List<Page> pages) {

    public record Page(Integer width, Integer height, List<Word> words) {
    }

    public record Word(String t, double x, double y, double w, double h) {
    }
}
