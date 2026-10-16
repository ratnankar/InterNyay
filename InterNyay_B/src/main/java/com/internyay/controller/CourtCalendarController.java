package com.internyay.controller;

import com.internyay.dto.CourtCalendarDto;
import com.internyay.entity.CourtCalendar;
import com.internyay.service.CourtCalendarService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

// Yearly court calendar PDF (Quick Access)
@RestController
@RequestMapping("/api/court-calendar")
@RequiredArgsConstructor
public class CourtCalendarController {

    private final CourtCalendarService calendarService;

    // Years that have a calendar uploaded
    @GetMapping
    public ResponseEntity<List<CourtCalendarDto>> list() {
        return ResponseEntity.ok(
                calendarService.listAll().stream().map(CourtCalendarDto::from).toList());
    }

    // Stream the PDF inline so it can be shown in an iframe
    @GetMapping("/{year}")
    public ResponseEntity<InputStreamResource> get(@PathVariable Integer year) {

        CourtCalendar calendar = calendarService.getCalendar(year);
        String fileName = (calendar.getFileName() != null) ? calendar.getFileName() : ("court-calendar-" + year + ".pdf");
        String encoded  = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename*=UTF-8''" + encoded)
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_PDF_VALUE)
                .body(new InputStreamResource(calendarService.openPdf(calendar)));
    }

    // Admin: upload or replace the calendar for a year
    @PostMapping(value = "/{year}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<CourtCalendarDto> upload(
            @PathVariable Integer year,
            @RequestParam("file") MultipartFile file) throws IOException {

        return ResponseEntity.ok(CourtCalendarDto.from(calendarService.uploadCalendar(year, file)));
    }

    // Admin: remove the calendar for a year
    @DeleteMapping("/{year}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Integer year) {
        calendarService.deleteCalendar(year);
        return ResponseEntity.noContent().build();
    }
}
