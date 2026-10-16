package com.internyay.controller;

import com.internyay.dto.LegalFormDto;
import com.internyay.entity.LegalForm;
import com.internyay.repository.LegalFormRepository;
import com.internyay.service.PdfFormService;
import com.internyay.service.StoredPdfFiles;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

// Legal Forms: blank PDFs, fillable versions and the admin field editor
@RestController
@RequestMapping("/api/legal-forms")
@RequiredArgsConstructor
public class LegalFormController {

    // Folder of the PDFs in file storage
    private static final String FOLDER = "legal-forms";

    private final LegalFormRepository formRepo;
    private final PdfFormService pdfForms;
    private final StoredPdfFiles files;
    private final ObjectMapper mapper;

    // All forms in their display order
    @GetMapping
    public ResponseEntity<List<LegalFormDto>> list() {
        return ResponseEntity.ok(
                sorted(formRepo.findAll()).stream().map(LegalFormDto::from).toList());
    }

    // Blank form PDF, inline. With plain=true a fillable form is sent without its editable fields;
    // otherwise it is sent as stored, so the fill window can type into it
    @GetMapping("/{id}/download")
    public ResponseEntity<byte[]> download(@PathVariable Long id,
                                           @RequestParam(defaultValue = "false") boolean plain) throws IOException {

        LegalForm form = formRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Legal form not found"));

        String fileName = (form.getFileName() != null) ? form.getFileName() : form.getName() + ".pdf";
        String encoded  = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");

        byte[] data;
        try (java.io.InputStream in = files.open(form.getStorageKey())) {
            data = in.readAllBytes();
        }
        if (plain && Boolean.TRUE.equals(form.getFillable())) {
            try {
                data = pdfForms.toPlain(data);
            } catch (RuntimeException | IOException e) {
                // If the plain copy cannot be made, the stored PDF is sent as it is
            }
        }

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename*=UTF-8''" + encoded)
                .header(HttpHeaders.CONTENT_TYPE,
                        form.getMimeType() != null ? form.getMimeType() : MediaType.APPLICATION_PDF_VALUE)
                .body(data);
    }

    // Admin: upload a new form PDF
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<LegalFormDto> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam String name,
            @RequestParam(required = false) String description,
            @RequestParam(defaultValue = "false") boolean fillable) throws IOException {

        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("A PDF file is required");
        }
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Form name is required");
        }

        LegalForm form = LegalForm.builder()
                .name(name)
                .description(blankToNull(description))
                .sortOrder(nextSortOrder())
                .fileName(file.getOriginalFilename())
                .mimeType(file.getContentType() != null ? file.getContentType() : MediaType.APPLICATION_PDF_VALUE)
                .sizeBytes(file.getSize())
                .uploadedAt(LocalDateTime.now())
                .build();

        // A plain form is streamed straight into storage. Making it fillable needs the whole PDF in memory
        // to rebuild it, and then the rebuilt one is what gets stored
        String key;
        if (fillable) {
            byte[] pdf = file.getBytes();
            byte[] rebuilt = applyFillable(form, true, pdf);
            key = files.save(FOLDER, rebuilt != null ? rebuilt : pdf);
        } else {
            applyFillable(form, false, null);
            key = files.save(FOLDER, file);
        }
        form.setStorageKey(key);

        try {
            return ResponseEntity.ok(LegalFormDto.from(formRepo.save(form)));
        } catch (RuntimeException e) {
            files.delete(key);
            throw e;
        }
    }

    // Admin: rename, replace the file or switch fillable on/off
    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<LegalFormDto> update(
            @PathVariable Long id,
            @RequestParam(required = false) MultipartFile file,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String description,
            @RequestParam(required = false) Boolean fillable) throws IOException {

        LegalForm form = find(id);

        if (name        != null && !name.isBlank())     form.setName(name);
        if (description != null)                        form.setDescription(blankToNull(description));

        String oldKey = form.getStorageKey();
        MultipartFile uploadedFile = null;

        // A new file invalidates the old fillable setup, so it is reset
        if (file != null && !file.isEmpty()) {
            uploadedFile = file;
            form.setFileName(file.getOriginalFilename());
            form.setMimeType(file.getContentType() != null ? file.getContentType() : MediaType.APPLICATION_PDF_VALUE);
            form.setSizeBytes(file.getSize());
            form.setFillable(false);
            form.setFieldCount(0);
            form.setFieldConfig(null);
            if (fillable == null) fillable = false;
        }

        // A new plain file is streamed into storage. Only a fillable rebuild needs the PDF in memory
        String newKey = null;
        if (fillable != null && fillable) {
            byte[] source = uploadedFile != null ? uploadedFile.getBytes() : null;
            byte[] rebuilt = applyFillable(form, true, source);
            byte[] toStore = rebuilt != null ? rebuilt : source;
            if (toStore != null) newKey = files.save(FOLDER, toStore);
        } else {
            if (fillable != null) applyFillable(form, false, null);
            if (uploadedFile != null) newKey = files.save(FOLDER, uploadedFile);
        }
        if (newKey != null) form.setStorageKey(newKey);

        LegalForm saved;
        try {
            saved = formRepo.save(form);
        } catch (RuntimeException e) {
            if (newKey != null) files.delete(newKey);
            throw e;
        }

        // The old PDF is removed only after the new state is saved
        if (newKey != null) files.delete(oldKey);
        return ResponseEntity.ok(LegalFormDto.from(saved));
    }

    // Fill the form with the given values and return the PDF
    @PostMapping("/{id}/fill")
    public ResponseEntity<byte[]> fill(@PathVariable Long id, @RequestBody Map<String, String> values) throws IOException {
        LegalForm form = find(id);
        if (!Boolean.TRUE.equals(form.getFillable())) {
            throw new IllegalArgumentException("This form is not fillable");
        }
        byte[] out = pdfForms.fill(files.read(form.getStorageKey()), values);
        String fileName = (form.getName() != null ? form.getName() : "form") + " (filled).pdf";
        String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename*=UTF-8''" + encoded)
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_PDF_VALUE)
                .body(out);
    }

    // Switch a form between plain and fillable, detecting fields when turned on.
    // Returns the rebuilt PDF to store, or null when the PDF itself did not change.
    // 'current' is the PDF just uploaded, null means the stored one is used
    private byte[] applyFillable(LegalForm form, boolean fillable, byte[] current) throws IOException {
        if (!fillable) {
            form.setFillable(false);
            form.setFieldCount(0);
            form.setFieldConfig(null);
            return null;
        }
        byte[] source = current != null ? current : files.read(form.getStorageKey());
        PdfFormService.Result r = pdfForms.makeFillable(source);
        if (r.fields().isEmpty()) {
            throw new IllegalArgumentException(
                    "No blanks or empty table cells were found in this PDF, so it could not be made fillable. "
                  + "Upload it as a plain form, or use a PDF that already has form fields.");
        }
        form.setSizeBytes(r.pdf().length);
        form.setFillable(true);
        form.setFieldCount(r.fields().size());
        form.setFieldConfig(fieldConfigJson(r.fields()));
        return r.pdf();
    }

    // Page sizes of the PDF for the field editor
    @GetMapping("/{id}/pages")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<PdfFormService.PageInfo>> pages(@PathVariable Long id) throws IOException {
        return ResponseEntity.ok(pdfForms.pageInfos(files.read(find(id).getStorageKey())));
    }

    // Size of the form as shown to users
    @GetMapping("/{id}/view-size")
    public ResponseEntity<PdfFormService.PageInfo> viewSize(@PathVariable Long id) throws IOException {
        return ResponseEntity.ok(pdfForms.viewSize(files.read(find(id).getStorageKey())));
    }

    // Page rendered as PNG so admin can draw fields on it
    @GetMapping(value = "/{id}/pages/{n}/image", produces = MediaType.IMAGE_PNG_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<byte[]> pageImage(@PathVariable Long id, @PathVariable int n,
                                            @RequestParam(defaultValue = "1.6") float scale) throws IOException {
        float s = Math.max(0.5f, Math.min(scale, 3f));
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(MediaType.IMAGE_PNG)
                .body(pdfForms.renderPage(files.read(find(id).getStorageKey()), n, s));
    }

    // Fields currently set up, merged with the saved labels and auto-fill sources
    @GetMapping("/{id}/field-specs")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<PdfFormService.FieldSpec>> fieldSpecs(
            @PathVariable Long id, @RequestParam(defaultValue = "false") boolean redetect) throws IOException {
        LegalForm form = find(id);
        return ResponseEntity.ok(pdfForms.suggestSpecs(files.read(form.getStorageKey()), redetect, savedConfig(form)));
    }

    // Admin: write the drawn fields into the PDF and save their config
    @PutMapping(value = "/{id}/fields", consumes = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<LegalFormDto> saveFields(@PathVariable Long id,
                                                   @RequestBody List<PdfFormService.FieldSpec> specs) throws IOException {
        LegalForm form = find(id);
        PdfFormService.Result r = pdfForms.applyFields(files.read(form.getStorageKey()), specs);
        applyResult(form, r);

        String oldKey = form.getStorageKey();
        String newKey = files.save(FOLDER, r.pdf());
        form.setStorageKey(newKey);

        LegalForm saved;
        try {
            saved = formRepo.save(form);
        } catch (RuntimeException e) {
            files.delete(newKey);
            throw e;
        }
        files.delete(oldKey);
        return ResponseEntity.ok(LegalFormDto.from(saved));
    }

    // Field config saved with the form: name, label, type, auto-fill and, for dates, the date layout
    private String fieldConfigJson(List<PdfFormService.FieldDef> fields) throws IOException {
        List<Map<String, String>> rows = new java.util.ArrayList<>();
        for (PdfFormService.FieldDef f : fields) {
            Map<String, String> row = new java.util.LinkedHashMap<>();
            row.put("name", f.name());
            row.put("label", f.label());
            row.put("type", f.type());
            row.put("autoFill", f.autoFill() == null ? "" : f.autoFill());
            if ("date".equals(f.type())) row.put("dateFormat", PdfFormService.cleanDateFormat(f.dateFormat()));
            rows.add(row);
        }
        return mapper.writeValueAsString(rows);
    }

    // Saved field config as a map keyed by field name
    private Map<String, Map<String, String>> savedConfig(LegalForm form) {
        Map<String, Map<String, String>> out = new java.util.HashMap<>();
        if (form.getFieldConfig() == null || form.getFieldConfig().isBlank()) return out;
        try {
            List<Map<String, String>> rows = mapper.readValue(form.getFieldConfig(),
                    new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, String>>>() {});
            for (Map<String, String> r : rows) if (r.get("name") != null) out.put(r.get("name"), r);
        } catch (Exception ignored) { }
        return out;
    }

    // Form by id or 404
    private LegalForm find(Long id) {
        return formRepo.findById(id).orElseThrow(() -> new NoSuchElementException("Legal form not found"));
    }

    // Copy the size and field config of a rebuilt PDF onto the form (the PDF itself is stored by the caller)
    private void applyResult(LegalForm form, PdfFormService.Result r) throws IOException {
        form.setSizeBytes(r.pdf().length);
        form.setFillable(true);
        form.setFieldCount(r.fields().size());
        form.setFieldConfig(fieldConfigJson(r.fields()));
    }

    // Admin: new display order, forms not in the list are kept after in their old order
    @PutMapping(value = "/reorder", consumes = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<LegalFormDto>> reorder(@RequestBody List<Long> ids) {
        Map<Long, LegalForm> byId = new java.util.HashMap<>();
        for (LegalForm f : formRepo.findAll()) byId.put(f.getId(), f);

        int pos = 0;
        List<LegalForm> changed = new java.util.ArrayList<>();
        for (Long id : ids) {
            LegalForm f = byId.remove(id);
            if (f == null) continue;
            f.setSortOrder(pos++);
            changed.add(f);
        }
        for (LegalForm f : sorted(new java.util.ArrayList<>(byId.values()))) {
            f.setSortOrder(pos++);
            changed.add(f);
        }
        formRepo.saveAll(changed);
        return ResponseEntity.ok(sorted(formRepo.findAll()).stream().map(LegalFormDto::from).toList());
    }

    // Order by sortOrder, ties by id
    private static List<LegalForm> sorted(List<LegalForm> in) {
        List<LegalForm> out = new java.util.ArrayList<>(in);
        out.sort(java.util.Comparator
                .comparing((LegalForm f) -> f.getSortOrder() == null ? Integer.MAX_VALUE : f.getSortOrder())
                .thenComparing(f -> f.getId() == null ? 0L : f.getId()));
        return out;
    }

    // Next free position for a new form
    private int nextSortOrder() {
        return formRepo.findAll().stream()
                .map(LegalForm::getSortOrder)
                .filter(java.util.Objects::nonNull)
                .max(Integer::compare).orElse(-1) + 1;
    }

    // Empty strings become null
    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    // Admin: delete a form
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        LegalForm form = find(id);
        formRepo.delete(form);
        files.delete(form.getStorageKey());
        return ResponseEntity.noContent().build();
    }
}
