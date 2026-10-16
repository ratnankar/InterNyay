package com.internyay.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.PDFGraphicsStreamEngine;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceEntry;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.apache.pdfbox.pdmodel.interactive.form.PDVariableText;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;

import java.awt.geom.Point2D;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.*;

// PDFBox work for Legal Forms: detect blanks, add fillable fields, render pages and fill values
@Service
public class PdfFormService {

    // A field that ended up in the PDF: name, label, type and which case value auto-fills it
    public record FieldDef(String name, String label, String type, String autoFill, String dateFormat) {}
    // Output PDF with its fields
    public record Result(byte[] pdf, List<FieldDef> fields, boolean alreadyFillable) {}

    // A field drawn by the admin: page, position, size and font settings
    public record FieldSpec(int page, float x, float y, float w, float h,
                            String label, String type, String align, Float fontSize, boolean bold, String autoFill,
                            String fontFamily, boolean italic, String dateFormat) {}
    // Page size in PDF points
    public record PageInfo(float width, float height) {}

    private static final float DEFAULT_FONT = 10f;

    private static final Map<String, Standard14Fonts.FontName> FONTS = new LinkedHashMap<>();
    static {
        FONTS.put("Helv", Standard14Fonts.FontName.HELVETICA);
        FONTS.put("HeBo", Standard14Fonts.FontName.HELVETICA_BOLD);
        FONTS.put("HeOb", Standard14Fonts.FontName.HELVETICA_OBLIQUE);
        FONTS.put("HeBO", Standard14Fonts.FontName.HELVETICA_BOLD_OBLIQUE);
        FONTS.put("TiRo", Standard14Fonts.FontName.TIMES_ROMAN);
        FONTS.put("TiBo", Standard14Fonts.FontName.TIMES_BOLD);
        FONTS.put("TiIt", Standard14Fonts.FontName.TIMES_ITALIC);
        FONTS.put("TiBI", Standard14Fonts.FontName.TIMES_BOLD_ITALIC);
        FONTS.put("Cour", Standard14Fonts.FontName.COURIER);
        FONTS.put("CoBo", Standard14Fonts.FontName.COURIER_BOLD);
        FONTS.put("CoOb", Standard14Fonts.FontName.COURIER_OBLIQUE);
        FONTS.put("CoBO", Standard14Fonts.FontName.COURIER_BOLD_OBLIQUE);
    }

    // Short PDF font name for family, bold and italic
    private static String fontKey(String family, boolean bold, boolean italic) {
        String f = family == null ? "helvetica" : family.toLowerCase();
        if (f.equals("times")) return bold && italic ? "TiBI" : bold ? "TiBo" : italic ? "TiIt" : "TiRo";
        if (f.equals("courier")) return bold && italic ? "CoBO" : bold ? "CoBo" : italic ? "CoOb" : "Cour";
        return bold && italic ? "HeBO" : bold ? "HeBo" : italic ? "HeOb" : "Helv";
    }

    // Font family from a font key
    private static String familyOf(String key) {
        return key.startsWith("Ti") ? "times" : key.startsWith("Co") ? "courier" : "helvetica";
    }
    private static boolean isBoldKey(String k)   { return k.equals("HeBo") || k.equals("HeBO") || k.equals("TiBo") || k.equals("TiBI") || k.equals("CoBo") || k.equals("CoBO"); }
    private static boolean isItalicKey(String k) { return k.equals("HeOb") || k.equals("HeBO") || k.equals("TiIt") || k.equals("TiBI") || k.equals("CoOb") || k.equals("CoBO"); }

    // Reads the font out of a field's default appearance string
    private static String fontKeyOfDa(String da) {
        if (da == null) return "Helv";
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("/(\\w+)\\s").matcher(da);
        return m.find() && FONTS.containsKey(m.group(1)) ? m.group(1) : "Helv";
    }

    // Reads the font size out of a field's default appearance string
    private static float fontSizeOfDa(String da) {
        if (da == null) return DEFAULT_FONT;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("/\\w+\\s+([0-9]*\\.?[0-9]+)\\s+Tf").matcher(da);
        if (!m.find()) return DEFAULT_FONT;
        try { return Math.max(0f, Math.min(Float.parseFloat(m.group(1)), 40f)); }
        catch (NumberFormatException e) { return DEFAULT_FONT; }
    }

    // Make the standard fonts available to the form
    private static void registerFonts(PDResources res) {
        FONTS.forEach((k, v) -> res.put(COSName.getPDFName(k), new PDType1Font(v)));
    }

    private static final float LINE_TOL = 2.5f;
    private static final Set<String> TRUTHY = Set.of("true", "yes", "on", "1", "x", "\u2713");

    // Uses the PDF's own fields when it has them, otherwise detects blank lines, cells and tick boxes
    public Result makeFillable(byte[] source) throws IOException {
        try (PDDocument doc = Loader.loadPDF(source)) {

            PDAcroForm existing = doc.getDocumentCatalog().getAcroForm();
            if (existing != null && !existing.getFields().isEmpty()) {
                return new Result(source, describeExisting(existing), true);
            }

            PDAcroForm form = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(form);
            PDResources res = new PDResources();
            res.put(COSName.getPDFName("Helv"), new PDType1Font(Standard14Fonts.FontName.HELVETICA));
            form.setDefaultResources(res);
            form.setDefaultAppearance("/Helv 0 Tf 0 g");
            form.setNeedAppearances(true);

            List<FieldDef> defs = new ArrayList<>();
            int n = 1;

            for (int p = 0; p < doc.getNumberOfPages(); p++) {
                PDPage page = doc.getPage(p);
                if (page.getRotation() != 0) continue;

                for (Box b : detect(doc, p)) {
                    String name = "field_" + n++;
                    String label = (b.label == null || b.label.isBlank()) ? "Field " + (n - 1) : b.label;

                    PDField field;
                    String type;
                    if (b.kind == Kind.CHECK) {
                        field = makeCheckBox(doc, form, b, name);
                        type = "checkbox";
                    } else {
                        PDTextField tf = new PDTextField(form);
                        tf.setPartialName(name);
                        boolean multi = b.kind == Kind.CELL && b.h > 60f;
                        tf.setMultiline(multi);
                        tf.setDefaultAppearance(multi ? "/Helv 10 Tf 0 g" : "/Helv 0 Tf 0 g");
                        if (b.kind == Kind.CELL) tf.setQ(PDVariableText.QUADDING_CENTERED);
                        setRect(tf, b);
                        field = tf;
                        type = multi ? "textarea" : "text";
                    }
                    field.setAlternateFieldName(label);

                    PDAnnotationWidget w = field.getWidgets().get(0);
                    w.setPage(page);
                    w.setPrinted(true);
                    page.getAnnotations().add(w);
                    form.getFields().add(field);

                    defs.add(new FieldDef(name, label, type, type.equals("checkbox") ? null : guessAutoFill(label), null));
                }
            }

            if (defs.isEmpty()) {
                return new Result(source, List.of(), false);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return new Result(out.toByteArray(), defs, false);
        }
    }

    // Size of every page
    public List<PageInfo> pageInfos(byte[] pdf) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            List<PageInfo> out = new ArrayList<>();
            for (PDPage page : doc.getPages()) {
                PDRectangle b = page.getCropBox();
                out.add(new PageInfo(b.getWidth(), b.getHeight()));
            }
            return out;
        }
    }

    // Size of the first page, A4 when the PDF is empty
    public PageInfo viewSize(byte[] pdf) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            if (doc.getNumberOfPages() == 0) return new PageInfo(595f, 842f);
            PDPage page = doc.getPage(0);
            PDRectangle b = page.getCropBox();
            int rot = ((page.getRotation() % 360) + 360) % 360;
            return (rot == 90 || rot == 270)
                    ? new PageInfo(b.getHeight(), b.getWidth())
                    : new PageInfo(b.getWidth(), b.getHeight());
        }
    }

    // Page as a PNG image at the given scale
    public byte[] renderPage(byte[] pdf, int pageIndex, float scale) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            if (pageIndex < 0 || pageIndex >= doc.getNumberOfPages()) {
                throw new IllegalArgumentException("No such page");
            }
            PDFRenderer r = new PDFRenderer(doc);
            r.setAnnotationsFilter(a -> !(a instanceof PDAnnotationWidget));
            BufferedImage img = r.renderImage(pageIndex, scale);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, "png", out);
            return out.toByteArray();
        }
    }

    // Fields to show in the editor: existing ones, saved ones or freshly detected ones
    public List<FieldSpec> suggestSpecs(byte[] pdf, boolean redetect, Map<String, Map<String, String>> saved) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            PDAcroForm existing = doc.getDocumentCatalog().getAcroForm();
            List<FieldSpec> out = new ArrayList<>();

            if (!redetect && existing != null && !existing.getFields().isEmpty()) {
                for (int p = 0; p < doc.getNumberOfPages(); p++) {
                    PDPage page = doc.getPage(p);
                    PDRectangle box = page.getCropBox();
                    for (PDAnnotation a : page.getAnnotations()) {
                        if (!(a instanceof PDAnnotationWidget w)) continue;
                        PDField f = existing.getField(fieldName(w));
                        if (f == null) continue;
                        PDRectangle r = w.getRectangle();
                        String label = f.getAlternateFieldName() != null ? f.getAlternateFieldName() : f.getPartialName();
                        Map<String, String> cfg = saved == null ? Map.of() : saved.getOrDefault(f.getPartialName(), Map.of());
                        boolean isCheck = f instanceof PDCheckBox;
                        boolean multi = f instanceof PDTextField t && t.isMultiline();
                        String fk = f instanceof PDTextField tb ? fontKeyOfDa(tb.getDefaultAppearance()) : "Helv";
                        float fontSize = f instanceof PDTextField tf2 ? fontSizeOfDa(tf2.getDefaultAppearance()) : DEFAULT_FONT;
                        boolean bold = isBoldKey(fk);
                        boolean italic = isItalicKey(fk);
                        String align = "left";
                        if (f instanceof PDTextField t) {
                            int q = t.getQ();
                            align = q == PDVariableText.QUADDING_CENTERED ? "center"
                                  : q == PDVariableText.QUADDING_RIGHT ? "right" : "left";
                        }
                        out.add(new FieldSpec(p, toFx(r.getLowerLeftX(), box), toFy(r.getUpperRightY(), box),
                                r.getWidth() / box.getWidth(), r.getHeight() / box.getHeight(),
                                label,
                                isCheck ? "checkbox" : multi ? "textarea" : "date".equals(cfg.get("type")) ? "date" : "text",
                                align, fontSize, bold,
                                cfg.containsKey("autoFill") ? cfg.get("autoFill") : guessAutoFill(label),
                                familyOf(fk), italic, cfg.get("dateFormat")));
                    }
                }
                return out;
            }

            if (existing != null || redetect) stripForm(doc);
            for (int p = 0; p < doc.getNumberOfPages(); p++) {
                PDPage page = doc.getPage(p);
                if (page.getRotation() != 0) continue;
                PDRectangle box = page.getCropBox();
                for (Box b : detect(doc, p)) {
                    String type = b.kind == Kind.CHECK ? "checkbox" : (b.kind == Kind.CELL && b.h > 60f ? "textarea" : "text");
                    out.add(new FieldSpec(p, toFx(b.x, box), toFy(b.y + b.h, box),
                            b.w / box.getWidth(), b.h / box.getHeight(),
                            b.label, type, b.kind == Kind.CELL ? "center" : "left",
                            DEFAULT_FONT, false, type.equals("checkbox") ? null : guessAutoFill(b.label),
                            "helvetica", false, null));
                }
            }
            return out;
        }
    }

    // Rebuilds the form's fields from the admin's drawn specs
    public Result applyFields(byte[] pdf, List<FieldSpec> specs) throws IOException {
        if (specs == null || specs.isEmpty()) throw new IllegalArgumentException("Mark at least one field");
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            stripForm(doc);

            PDAcroForm form = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(form);
            PDResources res = new PDResources();
            registerFonts(res);
            form.setDefaultResources(res);
            form.setDefaultAppearance("/Helv " + DEFAULT_FONT + " Tf 0 g");
            form.setNeedAppearances(true);

            List<FieldDef> defs = new ArrayList<>();
            int n = 1;
            for (FieldSpec sp : specs) {
                if (sp.page() < 0 || sp.page() >= doc.getNumberOfPages()) {
                    throw new IllegalArgumentException("A field is on a page that does not exist");
                }
                PDPage page = doc.getPage(sp.page());
                if (page.getRotation() != 0) {
                    throw new IllegalArgumentException("Page " + (sp.page() + 1) + " is rotated; rotated pages are not supported");
                }
                PDRectangle box = page.getCropBox();
                float w = Math.max(sp.w() * box.getWidth(), 6f);
                float h = Math.max(sp.h() * box.getHeight(), 6f);
                float x = box.getLowerLeftX() + sp.x() * box.getWidth();
                float y = box.getUpperRightY() - sp.y() * box.getHeight() - h;

                String name = "field_" + n++;
                String label = sp.label() == null || sp.label().isBlank() ? "Field " + (n - 1) : sp.label().trim();
                String type = sp.type() == null ? "text" : sp.type();
                if (!Set.of("text", "date", "textarea", "checkbox").contains(type)) type = "text";
                Box b = new Box(x, y, w, h, label, Kind.CELL);

                PDField field;
                if (type.equals("checkbox")) {
                    field = makeCheckBox(doc, form, b, name);
                } else {
                    PDTextField tf = new PDTextField(form);
                    tf.setPartialName(name);
                    float fs = sp.fontSize() == null ? DEFAULT_FONT : Math.max(0f, Math.min(sp.fontSize(), 40f));
                    tf.setMultiline(type.equals("textarea"));
                    tf.setDefaultAppearance("/" + fontKey(sp.fontFamily(), sp.bold(), sp.italic()) + " " + fs + " Tf 0 g");
                    String al = sp.align() == null ? "left" : sp.align();
                    tf.setQ(al.equals("center") ? PDVariableText.QUADDING_CENTERED
                          : al.equals("right") ? PDVariableText.QUADDING_RIGHT : PDVariableText.QUADDING_LEFT);
                    setRect(tf, b);
                    field = tf;
                }
                field.setAlternateFieldName(label);

                PDAnnotationWidget widget = field.getWidgets().get(0);
                widget.setPage(page);
                widget.setPrinted(true);
                page.getAnnotations().add(widget);
                form.getFields().add(field);

                String af = sp.autoFill() == null || sp.autoFill().isBlank() || type.equals("checkbox") ? null : sp.autoFill().trim();
                defs.add(new FieldDef(name, label, type, af, type.equals("date") ? cleanDateFormat(sp.dateFormat()) : null));
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return new Result(out.toByteArray(), defs, false);
        }
    }

    // Remove old form widgets so fields aren't duplicated
    private static void stripForm(PDDocument doc) throws IOException {
        for (PDPage page : doc.getPages()) {
            List<PDAnnotation> keep = new ArrayList<>();
            for (PDAnnotation a : page.getAnnotations()) if (!(a instanceof PDAnnotationWidget)) keep.add(a);
            page.setAnnotations(keep);
        }
        doc.getDocumentCatalog().setAcroForm(null);
    }

    // Name of a form widget
    private static String fieldName(PDAnnotationWidget w) {
        COSDictionary d = w.getCOSObject();
        String t = d.getString(COSName.T);
        return t == null ? "" : t;
    }

    private static float toFx(float pdfX, PDRectangle box) { return (pdfX - box.getLowerLeftX()) / box.getWidth(); }
    private static float toFy(float pdfTopY, PDRectangle box) { return (box.getUpperRightY() - pdfTopY) / box.getHeight(); }

    // Plain copy of a fillable PDF: the editable fields are removed so it opens as an ordinary static PDF
    public byte[] toPlain(byte[] pdf) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            if (doc.getDocumentCatalog().getAcroForm() == null) return pdf;
            for (org.apache.pdfbox.pdmodel.PDPage page : doc.getPages()) {
                List<org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation> keep = new ArrayList<>();
                for (org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation a : page.getAnnotations()) {
                    if (!(a instanceof org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget)) keep.add(a);
                }
                page.setAnnotations(keep);
            }
            doc.getDocumentCatalog().setAcroForm(null);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    // Date layouts an admin can pick for a Date field
    private static final Set<String> DATE_FORMATS = Set.of(
            "dd/mm/yyyy", "dd-mm-yyyy", "dd.mm.yyyy", "dd MMM yyyy", "dd MMMM yyyy", "yyyy-mm-dd", "mm/dd/yyyy");

    // A known date layout, or the default dd/mm/yyyy
    public static String cleanDateFormat(String f) {
        return f != null && DATE_FORMATS.contains(f.trim()) ? f.trim() : "dd/mm/yyyy";
    }

    // Fill values into the form fields
    public byte[] fill(byte[] pdf, Map<String, String> values) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            if (form == null) throw new IllegalArgumentException("This form is not fillable");
            // NeedAppearances must be OFF while values are set: with it on, PDFBox skips drawing each field's
            // appearance, so the saved PDF holds the values but shows blank boxes once downloaded
            form.setNeedAppearances(false);
            for (Map.Entry<String, String> e : values.entrySet()) {
                if (e.getValue() == null || e.getValue().isBlank()) continue;
                PDField f = form.getField(e.getKey());
                try {
                    if (f instanceof PDTextField tf) {
                        tf.setValue(e.getValue());
                    } else if (f instanceof PDCheckBox cb) {
                        if (TRUTHY.contains(e.getValue().trim().toLowerCase())) cb.check(); else cb.unCheck();
                    }
                } catch (IllegalArgumentException | IOException ignored) {
                }
            }
            // Draw every field's appearance into the file so any viewer shows the values
            try {
                form.refreshAppearances();
            } catch (IOException | RuntimeException ignored) {
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    // List the text fields already in the PDF
    private List<FieldDef> describeExisting(PDAcroForm form) {
        List<FieldDef> defs = new ArrayList<>();
        for (PDField f : form.getFieldTree()) {
            if (f instanceof PDTextField tf) {
                String label = tf.getAlternateFieldName() != null && !tf.getAlternateFieldName().isBlank()
                        ? tf.getAlternateFieldName() : tf.getFullyQualifiedName();
                defs.add(new FieldDef(tf.getFullyQualifiedName(), label,
                        tf.isMultiline() ? "textarea" : "text", guessAutoFill(label), null));
            } else if (f instanceof PDCheckBox cb) {
                String label = cb.getAlternateFieldName() != null && !cb.getAlternateFieldName().isBlank()
                        ? cb.getAlternateFieldName() : cb.getFullyQualifiedName();
                defs.add(new FieldDef(cb.getFullyQualifiedName(), label, "checkbox", null, null));
            }
        }
        return defs;
    }

    // One text character with its position
    private record Ch(String s, float x, float w, float y, float size) {}
    // Kinds of areas that can be filled
    private enum Kind { LINE, CELL, CHECK }
    private record Box(float x, float y, float w, float h, String label, Kind kind) {}
    private record Seg(float a, float b, float pos) {}
    private record Cell(float x0, float y0, float x1, float y1) {}

    // Finds fillable areas on one page
    private List<Box> detect(PDDocument doc, int pageIndex) throws IOException {
        PDPage page = doc.getPage(pageIndex);
        PDRectangle mb = page.getMediaBox();

        CharCollector cc = new CharCollector(mb.getUpperRightY());
        cc.setStartPage(pageIndex + 1);
        cc.setEndPage(pageIndex + 1);
        cc.getText(doc);
        List<Ch> chars = cc.chars;

        LineCollector lc = new LineCollector(page);
        lc.processPage(page);

        List<Box> boxes = new ArrayList<>();
        blankRuns(chars, boxes);
        emptyCells(chars, merge(lc.horizontal), merge(lc.vertical), mb, boxes);
        checkBoxes(chars, lc.checks, boxes);
        return boxes;
    }

    // Characters used to draw blank lines
    private static boolean isBlank(String s) {
        return s.equals("_") || s.equals(".") || s.equals("\u2026");
    }

    // Runs of underscores or dots are treated as blank lines to fill
    private void blankRuns(List<Ch> chars, List<Box> out) {
        int i = 0;
        while (i < chars.size()) {
            Ch c = chars.get(i);
            if (!isBlank(c.s)) { i++; continue; }
            int j = i;
            while (j + 1 < chars.size()
                    && chars.get(j + 1).s.equals(c.s)
                    && Math.abs(chars.get(j + 1).y - c.y) < LINE_TOL) j++;
            int len = j - i + 1;
            int min = c.s.equals("_") ? 4 : c.s.equals(".") ? 5 : 3;
            if (len >= min) {
                Ch last = chars.get(j);
                float x0 = c.x, x1 = last.x + last.w;
                float h = Math.max(c.size, 10f) + 4f;
                out.add(new Box(x0, c.y - 3f, x1 - x0, h, labelBefore(chars, i), Kind.LINE));
            }
            i = j + 1;
        }
    }

    // Text just before a blank, used as the field label
    private String labelBefore(List<Ch> chars, int idx) {
        Ch ref = chars.get(idx);
        StringBuilder sb = new StringBuilder();
        for (int j = idx - 1; j >= 0; j--) {
            Ch c = chars.get(j);
            if (Math.abs(c.y - ref.y) >= LINE_TOL || c.x > ref.x) break;
            if (isBlank(c.s)) continue;
            Ch next = chars.get(j + 1);
            if (next.x - (c.x + c.w) > 15f && !isBlank(next.s)) break;
            sb.append(c.s);
            if (sb.length() > 70) break;
        }
        String s = sb.reverse().toString().replaceAll("\\s+", " ").trim();
        s = s.replaceAll("[\\s:\\-\u2013]+$", "");
        return s.length() > 60 ? s.substring(s.length() - 60) : s;
    }

    // Empty cells of a table grid
    private void emptyCells(List<Ch> chars, List<Seg> hs, List<Seg> vs, PDRectangle mb, List<Box> out) {
        if (hs.size() < 2 || vs.size() < 2) return;

        List<Float> ys = cluster(hs.stream().map(s -> s.pos).toList());
        List<Cell> cells = new ArrayList<>();

        for (int k = 0; k + 1 < ys.size(); k++) {
            float yLow = ys.get(k), yHigh = ys.get(k + 1);
            if (yHigh - yLow < 10f) continue;
            List<Float> xs = cluster(vs.stream()
                    .filter(v -> v.a <= yLow + 3f && v.b >= yHigh - 3f)
                    .map(v -> v.pos).toList());
            for (int m = 0; m + 1 < xs.size(); m++) {
                float xa = xs.get(m), xb = xs.get(m + 1);
                if (xb - xa < 20f) continue;
                if (xb - xa > mb.getWidth() * 0.95f) continue;
                if (covered(hs, yLow, xa, xb) && covered(hs, yHigh, xa, xb)) {
                    cells.add(new Cell(xa, yLow, xb, yHigh));
                }
            }
        }

        for (Cell c : cells) {
            if (!textIn(chars, c).isEmpty()) continue;
            String label = neighbourLabel(chars, cells, c, -1);
            if (label.isEmpty()) label = neighbourLabel(chars, cells, c, +1);
            if (label.isEmpty()) {
                for (Cell u : cells) {
                    if (Math.abs(u.y0 - c.y1) < 3f && Math.abs(u.x0 - c.x0) < 3f) {
                        label = textIn(chars, u);
                        break;
                    }
                }
            }
            if (label.length() > 60) label = label.substring(0, 60);
            out.add(new Box(c.x0 + 1.5f, c.y0 + 1.5f, c.x1 - c.x0 - 3f, c.y1 - c.y0 - 3f, label, Kind.CELL));
        }
    }

    // Label of the cell to the left or above
    private static String neighbourLabel(List<Ch> chars, List<Cell> cells, Cell from, int dir) {
        Cell cur = from;
        for (int hop = 0; hop < 3; hop++) {
            Cell next = null;
            for (Cell o : cells) {
                boolean adjacent = dir < 0 ? Math.abs(o.x1 - cur.x0) < 4f : Math.abs(o.x0 - cur.x1) < 4f;
                if (adjacent && Math.abs(o.y0 - cur.y0) < 3f) { next = o; break; }
            }
            if (next == null) return "";
            String t = textIn(chars, next);
            if (t.isEmpty()) return "";
            if (!isSerial(t)) return t;
            cur = next;
        }
        return "";
    }

    // Serial numbers like 1 or 12, ignored as labels
    private static boolean isSerial(String t) {
        return t.matches("\\d{1,2}");
    }

    // Joins touching line segments
    private static List<Seg> merge(List<Seg> in) {
        List<Seg> s = new ArrayList<>(in);
        s.sort(Comparator.comparingDouble(Seg::pos));
        List<Seg> out = new ArrayList<>();
        int i = 0;
        while (i < s.size()) {
            float base = s.get(i).pos();
            List<Seg> grp = new ArrayList<>();
            int j = i;
            while (j < s.size() && s.get(j).pos() - base <= LINE_TOL) { grp.add(s.get(j)); j++; }
            grp.sort(Comparator.comparingDouble(Seg::a));
            float pos = (float) grp.stream().mapToDouble(Seg::pos).average().orElse(base);
            float a = grp.get(0).a(), b = grp.get(0).b();
            for (int k = 1; k < grp.size(); k++) {
                Seg g = grp.get(k);
                if (g.a() <= b + 2f) b = Math.max(b, g.b());
                else { out.add(new Seg(a, b, pos)); a = g.a(); b = g.b(); }
            }
            out.add(new Seg(a, b, pos));
            i = j;
        }
        return out;
    }

    // Small squares are treated as tick boxes
    private void checkBoxes(List<Ch> chars, List<float[]> raw, List<Box> out) {
        List<float[]> uniq = new ArrayList<>();
        for (float[] r : raw) {
            boolean dup = false;
            for (float[] u : uniq) if (Math.abs(u[0] - r[0]) < 3f && Math.abs(u[1] - r[1]) < 3f) { dup = true; break; }
            if (!dup) uniq.add(r);
        }
        for (float[] r : uniq) {
            List<Ch> row = new ArrayList<>();
            for (Ch c : chars) {
                if (c.x >= r[2] - 1f && c.y >= r[1] - 3f && c.y <= r[3]) row.add(c);
            }
            row.sort(Comparator.comparingDouble((Ch c) -> c.x));
            StringBuilder sb = new StringBuilder();
            float prevEnd = r[2];
            for (Ch c : row) {
                if (c.x - prevEnd > 10f) break;
                sb.append(c.s);
                prevEnd = c.x + c.w;
                if (sb.length() > 30) break;
            }
            out.add(new Box(r[0], r[1], r[2] - r[0], r[3] - r[1], sb.toString().trim(), Kind.CHECK));
        }
    }

    // Move a text field to a box
    private static void setRect(PDTextField tf, Box b) {
        tf.getWidgets().get(0).setRectangle(new PDRectangle(b.x, b.y, b.w, b.h));
    }

    // Creates a tick box with an appearance for on and off
    private PDCheckBox makeCheckBox(PDDocument doc, PDAcroForm form, Box b, String name) throws IOException {
        PDCheckBox cb = new PDCheckBox(form);
        cb.setPartialName(name);
        PDAnnotationWidget w = cb.getWidgets().get(0);
        w.setRectangle(new PDRectangle(b.x, b.y, b.w, b.h));

        COSDictionary states = new COSDictionary();
        states.setItem(COSName.getPDFName("Yes"), tickStream(doc, b.w, b.h, true));
        states.setItem(COSName.OFF, tickStream(doc, b.w, b.h, false));
        PDAppearanceDictionary ap = new PDAppearanceDictionary();
        ap.setNormalAppearance(new PDAppearanceEntry(states));
        w.setAppearance(ap);
        w.setAppearanceState("Off");
        return cb;
    }

    // Draws the tick mark
    private static PDAppearanceStream tickStream(PDDocument doc, float w, float h, boolean on) throws IOException {
        PDAppearanceStream s = new PDAppearanceStream(doc);
        s.setBBox(new PDRectangle(w, h));
        s.setResources(new PDResources());
        try (PDPageContentStream cs = new PDPageContentStream(doc, s)) {
            if (on) {
                float side = Math.min(w, h) - 6f;
                float x0 = (w - side) / 2f, y0 = (h - side) / 2f;
                cs.setLineWidth(1.5f);
                cs.moveTo(x0, y0);        cs.lineTo(x0 + side, y0 + side);
                cs.moveTo(x0, y0 + side); cs.lineTo(x0 + side, y0);
                cs.stroke();
            }
        }
        return s;
    }

    // True when a drawn line already sits under this range
    private static boolean covered(List<Seg> hs, float y, float xa, float xb) {
        for (Seg s : hs) {
            if (Math.abs(s.pos - y) <= LINE_TOL + 1f && s.a <= xa + 3f && s.b >= xb - 3f) return true;
        }
        return false;
    }

    // Text inside a table cell
    private static String textIn(List<Ch> chars, Cell c) {
        StringBuilder sb = new StringBuilder();
        for (Ch ch : chars) {
            float cx = ch.x + ch.w / 2f, cy = ch.y + ch.size * 0.3f;
            if (cx >= c.x0 && cx <= c.x1 && cy >= c.y0 && cy <= c.y1) sb.append(ch.s);
        }
        return sb.toString().replaceAll("\\s+", " ").trim();
    }

    // Groups coordinates that are almost the same
    private static List<Float> cluster(List<Float> values) {
        List<Float> sorted = new ArrayList<>(values);
        Collections.sort(sorted);
        List<Float> out = new ArrayList<>();
        float sum = 0; int cnt = 0; float prev = Float.NaN;
        for (float v : sorted) {
            if (cnt > 0 && v - prev > 2f) { out.add(sum / cnt); sum = 0; cnt = 0; }
            sum += v; cnt++; prev = v;
        }
        if (cnt > 0) out.add(sum / cnt);
        return out;
    }

    // Maps a label like "FIR No" to a case field so it can be pre-filled
    static String guessAutoFill(String label) {
        String l = label == null ? "" : label.toLowerCase();
        if (l.matches(".*\\bfir\\b.*")) return "case.firNo";
        if (l.contains("case no") || l.contains("suit no") || l.contains("case or suit")
                || l.contains("suit/appeal")) return "case.caseNo";
        if (l.equals("u/s") || l.contains("section")) return "case.firSection";
        if (l.equals("ps") || l.equals("p.s") || l.contains("police station")) return "case.policeStation";
        return null;
    }

    // Collects characters and their positions from the PDF
    private static class CharCollector extends PDFTextStripper {
        final List<Ch> chars = new ArrayList<>();
        private final float pageTop;

        CharCollector(float pageTop) throws IOException {
            this.pageTop = pageTop;
            setSortByPosition(true);
        }

        @Override
        // Records every character with its position, measured from the top of the page
        protected void writeString(String text, List<TextPosition> positions) {
            for (TextPosition t : positions) {
                chars.add(new Ch(t.getUnicode(), t.getXDirAdj(), t.getWidthDirAdj(),
                        pageTop - t.getYDirAdj(), t.getFontSizeInPt()));
            }
        }
    }

    // Collects the horizontal and vertical lines drawn on the page
    private static class LineCollector extends PDFGraphicsStreamEngine {
        final List<Seg> horizontal = new ArrayList<>();
        final List<Seg> vertical = new ArrayList<>();
        final List<float[]> checks = new ArrayList<>();

        private final List<Seg> pendH = new ArrayList<>(), pendV = new ArrayList<>();
        private float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE, maxX = -Float.MAX_VALUE, maxY = -Float.MAX_VALUE;
        private boolean hadCurve = false;

        private Point2D.Float cur = new Point2D.Float();
        private final float pageW;

        LineCollector(PDPage page) {
            super(page);
            this.pageW = page.getMediaBox().getWidth();
        }

        // Grows the bounding box of the path being drawn
        private void track(float x, float y) {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }

        // Ends a path: a small curved shape is kept as a checkbox, otherwise its straight lines are kept
        private void finishPath() {
            if (hadCurve) {
                float bw = maxX - minX, bh = maxY - minY;
                if (bw >= 10f && bw <= 40f && bh >= 10f && bh <= 40f) checks.add(new float[]{minX, minY, maxX, maxY});
            } else {
                horizontal.addAll(pendH);
                vertical.addAll(pendV);
            }
            pendH.clear(); pendV.clear();
            hadCurve = false;
            minX = minY = Float.MAX_VALUE; maxX = maxY = -Float.MAX_VALUE;
        }

        // Keeps a segment only when it is a long enough horizontal or vertical line
        private void seg(float x0, float y0, float x1, float y1) {
            float dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
            if (dy <= 1f && dx > 5f) pendH.add(new Seg(Math.min(x0, x1), Math.max(x0, x1), (y0 + y1) / 2f));
            else if (dx <= 1f && dy > 5f) pendV.add(new Seg(Math.min(y0, y1), Math.max(y0, y1), (x0 + x1) / 2f));
        }

        @Override public void appendRectangle(Point2D p0, Point2D p1, Point2D p2, Point2D p3) {
            float rMinX = (float) Math.min(Math.min(p0.getX(), p1.getX()), Math.min(p2.getX(), p3.getX()));
            float rMaxX = (float) Math.max(Math.max(p0.getX(), p1.getX()), Math.max(p2.getX(), p3.getX()));
            float rMinY = (float) Math.min(Math.min(p0.getY(), p1.getY()), Math.min(p2.getY(), p3.getY()));
            float rMaxY = (float) Math.max(Math.max(p0.getY(), p1.getY()), Math.max(p2.getY(), p3.getY()));
            float w = rMaxX - rMinX, h = rMaxY - rMinY;
            if (w >= pageW * 0.95f && h > 100f) return;
            if (h <= LINE_TOL && w > 5f) {
                horizontal.add(new Seg(rMinX, rMaxX, (rMinY + rMaxY) / 2f));
            } else if (w <= LINE_TOL && h > 5f) {
                vertical.add(new Seg(rMinY, rMaxY, (rMinX + rMaxX) / 2f));
            } else if (w >= 20f && h >= 10f) {
                horizontal.add(new Seg(rMinX, rMaxX, rMinY));
                horizontal.add(new Seg(rMinX, rMaxX, rMaxY));
                vertical.add(new Seg(rMinY, rMaxY, rMinX));
                vertical.add(new Seg(rMinY, rMaxY, rMaxX));
            }
        }

        @Override public void moveTo(float x, float y) { cur = new Point2D.Float(x, y); track(x, y); }
        @Override public void lineTo(float x, float y) { seg(cur.x, cur.y, x, y); cur = new Point2D.Float(x, y); track(x, y); }
        @Override public void curveTo(float x1, float y1, float x2, float y2, float x3, float y3) {
            hadCurve = true;
            cur = new Point2D.Float(x3, y3);
            track(x3, y3);
        }
        @Override public Point2D getCurrentPoint() { return cur; }
        @Override public void closePath() {}
        @Override public void endPath() { finishPath(); }
        @Override public void clip(int windingRule) {}
        @Override public void strokePath() { finishPath(); }
        @Override public void fillPath(int windingRule) { finishPath(); }
        @Override public void fillAndStrokePath(int windingRule) { finishPath(); }
        @Override public void shadingFill(COSName shadingName) {}
        @Override public void drawImage(PDImage pdImage) {}
    }
}
