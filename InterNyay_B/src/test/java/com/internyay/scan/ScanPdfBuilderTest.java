package com.internyay.scan;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ScanPdfBuilderTest {

    private static byte[] jpeg(int width, int height) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        var g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, width, height);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", out);
        return out.toByteArray();
    }

    @Test
    void buildsImageOnlyPdfWithoutOcr() throws Exception {
        byte[] pdf = new ScanPdfBuilder().build(List.of(jpeg(800, 1200), jpeg(800, 1000)), null);
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertEquals(2, doc.getNumberOfPages());
            assertEquals("", new PDFTextStripper().getText(doc).trim());
        }
    }

    @Test
    void addsSearchableEnglishAndHindiText() throws Exception {
        ScanOcr ocr = new ScanOcr("hi", 0.9, "Order न्यायालय", List.of(
                new ScanOcr.Page(800, 1200, List.of(
                        new ScanOcr.Word("Order", 50, 100, 120, 30),
                        new ScanOcr.Word("न्यायालय", 200, 100, 160, 30)))));
        byte[] pdf = new ScanPdfBuilder().build(List.of(jpeg(800, 1200)), ocr);
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains("Order"));
            assertTrue(text.contains("न्यायालय"));
        }
    }
}
