package com.internyay.scan;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.util.Matrix;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Locale;

@Component
public class ScanPdfBuilder {

    private static final float PAGE_WIDTH = 595f;
    private static final String DEVANAGARI_FONT = "/fonts/NotoSansDevanagari-Regular.ttf";

    public byte[] build(List<byte[]> images, ScanOcr ocr) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            Fonts fonts = new Fonts(doc);
            for (int i = 0; i < images.size(); i++) {
                PDImageXObject image = PDImageXObject.createFromByteArray(doc, images.get(i), "page-" + (i + 1));
                float height = PAGE_WIDTH * image.getHeight() / image.getWidth();
                PDPage page = new PDPage(new PDRectangle(PAGE_WIDTH, height));
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.drawImage(image, 0, 0, PAGE_WIDTH, height);
                    ScanOcr.Page ocrPage = pageAt(ocr, i);
                    if (ocrPage != null) {
                        writeInvisibleText(cs, ocrPage, PAGE_WIDTH, height, fonts);
                    }
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static ScanOcr.Page pageAt(ScanOcr ocr, int index) {
        if (ocr == null || ocr.pages() == null || index >= ocr.pages().size()) {
            return null;
        }
        ScanOcr.Page page = ocr.pages().get(index);
        if (page == null || page.words() == null || page.width() == null || page.height() == null
                || page.width() <= 0 || page.height() <= 0) {
            return null;
        }
        return page;
    }

    private void writeInvisibleText(PDPageContentStream cs, ScanOcr.Page page, float pageWidth, float pageHeight,
                                    Fonts fonts) throws IOException {
        float sx = pageWidth / page.width();
        float sy = pageHeight / page.height();
        cs.beginText();
        cs.appendRawCommands("3 Tr\n");
        for (ScanOcr.Word word : page.words()) {
            if (word == null || word.t() == null) {
                continue;
            }
            String text = word.t().replaceAll("[\\p{Cntrl}]", "").trim();
            if (text.isEmpty() || word.w() <= 0 || word.h() <= 0) {
                continue;
            }
            PDFont font = fonts.pick(text);
            if (font == null) {
                continue;
            }
            float size = clamp((float) (word.h() * sy), 4f, 72f);
            float natural = font.getStringWidth(text) / 1000f * size;
            if (natural <= 0) {
                continue;
            }
            float scale = clamp((float) (word.w() * sx) / natural * 100f, 10f, 500f);
            float x = (float) (word.x() * sx);
            float y = pageHeight - (float) ((word.y() + word.h()) * sy) + size * 0.2f;
            cs.appendRawCommands(String.format(Locale.ROOT, "%.2f Tz\n", scale));
            cs.setFont(font, size);
            cs.setTextMatrix(Matrix.getTranslateInstance(x, y));
            cs.showText(text);
        }
        cs.endText();
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    private static boolean hasDevanagari(String text) {
        return text.codePoints().anyMatch(c -> c >= 0x0900 && c <= 0x097F);
    }

    private static boolean canEncode(PDFont font, String text) {
        try {
            font.encode(text);
            return true;
        } catch (IllegalArgumentException | IOException e) {
            return false;
        }
    }

    private static final class Fonts {

        private final PDDocument doc;
        private final PDFont latin = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        private PDFont devanagari;
        private boolean devanagariTried;

        Fonts(PDDocument doc) {
            this.doc = doc;
        }

        PDFont pick(String text) throws IOException {
            if (!hasDevanagari(text) && canEncode(latin, text)) {
                return latin;
            }
            PDFont deva = devanagari();
            if (deva != null && canEncode(deva, text)) {
                return deva;
            }
            return canEncode(latin, text) ? latin : null;
        }

        private PDFont devanagari() throws IOException {
            if (!devanagariTried) {
                devanagariTried = true;
                try (InputStream in = ScanPdfBuilder.class.getResourceAsStream(DEVANAGARI_FONT)) {
                    if (in != null) {
                        devanagari = PDType0Font.load(doc, in);
                    }
                }
            }
            return devanagari;
        }
    }
}
