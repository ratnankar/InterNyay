package com.internyay.controller;

import com.internyay.dto.DistrictPdfDto;
import com.internyay.entity.DistrictPdf;
import com.internyay.service.DistrictPdfService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

// One PDF per district for each Quick Access section
@RestController
@RequestMapping("/api/quick-access/district-pdfs")
@RequiredArgsConstructor
public class DistrictPdfController {

    private final DistrictPdfService districtPdfService;

    // Which district PDFs exist, optionally for one section
    @GetMapping
    public ResponseEntity<List<DistrictPdfDto>> list(@RequestParam(required = false) String section) {
        return ResponseEntity.ok(
                districtPdfService.list(section).stream().map(DistrictPdfDto::from).toList());
    }

    // Stream the PDF for a section and district
    @GetMapping("/file")
    public ResponseEntity<InputStreamResource> file(@RequestParam String section,
                                                    @RequestParam String district) throws IOException {
        DistrictPdf entry = districtPdfService.get(section, district);
        InputStream file = districtPdfService.pdf(section, district);

        String fileName = entry.getPdfFileName() != null
                ? entry.getPdfFileName()
                : entry.getSection().name().toLowerCase().replace('_', '-') + "-" + entry.getDistrict() + ".pdf";
        String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename*=UTF-8''" + encoded)
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_PDF_VALUE)
                .body(new InputStreamResource(file));
    }

    // Admin: upload or replace a district PDF
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<DistrictPdfDto> upload(@RequestParam String section,
                                              @RequestParam String district,
                                              @RequestParam("file") MultipartFile file) throws IOException {
        return ResponseEntity.ok(DistrictPdfDto.from(districtPdfService.save(section, district, file)));
    }

    // Admin: delete a district PDF
    @DeleteMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@RequestParam String section, @RequestParam String district) {
        districtPdfService.delete(section, district);
        return ResponseEntity.noContent().build();
    }
}
