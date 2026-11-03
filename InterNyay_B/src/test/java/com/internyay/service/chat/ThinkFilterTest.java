package com.internyay.service.chat;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ThinkFilterTest {

    private static String run(String... chunks) {
        ThinkFilter filter = new ThinkFilter();
        StringBuilder out = new StringBuilder();
        for (String chunk : chunks) out.append(filter.accept(chunk));
        out.append(filter.finish());
        return out.toString();
    }

    @Test
    void removesThinkingSplitAcrossChunks() {
        assertEquals("Hello World", run("Hel", "lo <thi", "nk>secret ", "stuff</th", "ink>World"));
    }

    @Test
    void keepsPlainTextAndPartialTagLookalikes() {
        assertEquals("a < b and <b>bold</b>", run("a < b", " and <b>bold</b>"));
    }

    @Test
    void dropsUnclosedThinking() {
        assertEquals("ac", run("a<think>b</think>c<think>zz"));
    }
}
