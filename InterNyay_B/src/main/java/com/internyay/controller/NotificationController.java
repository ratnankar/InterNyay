package com.internyay.controller;

import com.internyay.dto.NotificationDto;
import com.internyay.entity.Notification;
import com.internyay.service.NotificationService;
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
import java.time.LocalDate;
import java.util.List;

// Notifications & Circulations shown on the dashboard
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;
    private final AuthHelper auth;

    // Notifications, optionally for one source (court / bar association)
    @GetMapping
    public ResponseEntity<List<NotificationDto>> list(@RequestParam(required = false) String source) {

        List<Notification> rows = (source == null || source.isBlank() || "All".equalsIgnoreCase(source))
                ? notificationService.listAll()
                : notificationService.listBySource(source);

        return ResponseEntity.ok(rows.stream().map(NotificationDto::from).toList());
    }

    // Latest update marker so the frontend knows when to refetch
    @GetMapping("/stamp")
    public ResponseEntity<java.util.Map<String, String>> stamp() {
        return ResponseEntity.ok(java.util.Map.of("stamp", notificationService.changeStamp()));
    }

    // Important notifications this user hasn't dismissed yet
    @GetMapping("/important/pending")
    public ResponseEntity<List<NotificationDto>> pendingImportant() {
        return ResponseEntity.ok(
                notificationService.listPendingImportant(auth.currentAccount())
                        .stream().map(NotificationDto::from).toList());
    }

    // Dismiss an important notification for this user only
    @PostMapping("/{id}/dismiss")
    public ResponseEntity<Void> dismiss(@PathVariable Long id) {
        notificationService.dismiss(auth.currentAccountId(), id);
        return ResponseEntity.noContent().build();
    }

    // Notification PDF from file storage
    @GetMapping("/{id}/download")
    public ResponseEntity<InputStreamResource> download(@PathVariable Long id) throws IOException {

        Notification n = notificationService.get(id);
        InputStream file = notificationService.getBinary(n);

        String fileName = (n.getFileName() != null) ? n.getFileName() : ("notification-" + id + ".pdf");
        String encoded  = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encoded)
                .header(HttpHeaders.CONTENT_TYPE,
                        n.getMimeType() != null ? n.getMimeType() : MediaType.APPLICATION_PDF_VALUE)
                .body(new InputStreamResource(file));
    }

    // Admin: publish a notification with its PDF
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<NotificationDto> push(
            @RequestParam String source,
            @RequestParam String title,
            @RequestParam(required = false) String message,
            @RequestParam(required = false) LocalDate date,
            @RequestParam(required = false) MultipartFile file,
            @RequestParam(required = false, defaultValue = "false") boolean important) throws IOException {

        if (source == null || source.isBlank()) throw new IllegalArgumentException("Source is required");
        if (title  == null || title.isBlank())  throw new IllegalArgumentException("Title is required");

        Notification saved = notificationService.push(source, title, message, date, file, important);
        return ResponseEntity.ok(NotificationDto.from(saved));
    }

    // Admin: edit a notification or replace its PDF
    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<NotificationDto> update(
            @PathVariable Long id,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String title,
            @RequestParam(required = false) String message,
            @RequestParam(required = false) LocalDate date,
            @RequestParam(required = false) MultipartFile file,
            @RequestParam(required = false, defaultValue = "false") boolean removeFile,
            @RequestParam(required = false) Boolean important) throws IOException {

        Notification saved = notificationService.update(id, source, title, message, date, file, removeFile, important);
        return ResponseEntity.ok(NotificationDto.from(saved));
    }

    // Admin: delete a notification
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        notificationService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
