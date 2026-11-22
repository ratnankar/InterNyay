package com.internyay.scan;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ImageSnifferTest {

    @Test
    void acceptsJpegAndPng() {
        assertTrue(ImageSniffer.isSupported(new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0}));
        assertTrue(ImageSniffer.isSupported(new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0}));
    }

    @Test
    void rejectsPdfHtmlAndEmpty() {
        assertFalse(ImageSniffer.isSupported("%PDF-1.7 content".getBytes()));
        assertFalse(ImageSniffer.isSupported("<html></html>".getBytes()));
        assertFalse(ImageSniffer.isSupported(new byte[0]));
        assertFalse(ImageSniffer.isSupported(null));
    }
}
