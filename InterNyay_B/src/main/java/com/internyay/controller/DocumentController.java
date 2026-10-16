package com.internyay.controller;

import com.internyay.dto.DocumentDto;
import com.internyay.entity.DocumentMeta;
import com.internyay.repository.HearingRepository;
import com.internyay.service.DocumentService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

// Document list, download and delete across cases, clients and advocate files
@RestController
@RequestMapping("/api/documents")
@RequiredArgsConstructor
public class DocumentController {

    private final DocumentService documentService;
    private final HearingRepository hearingRepo;
    private final AuthHelper auth;

    // Case and client documents, filterable
    @GetMapping
    public ResponseEntity<List<DocumentDto>> list(
            @RequestParam(required = false) Long caseId,
            @RequestParam(required = false) Long clientId) {

        if (caseId != null)   return ResponseEntity.ok(documentService.listForCase(caseId, auth.currentUserId()));
        if (clientId != null) return ResponseEntity.ok(documentService.listForClient(clientId, auth.currentUserId()));

        return ResponseEntity.ok(documentService.listForUser(auth.currentUserId()));
    }

    // Documents that belong to the advocate rather than a case or client
    @GetMapping("/advocate")
    public ResponseEntity<List<DocumentDto>> listAdvocateDocs() {
        return ResponseEntity.ok(documentService.listForAdvocate(auth.currentUserId()));
    }

    // Upload an advocate level document
    @PostMapping(value = "/advocate", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DocumentDto> uploadAdvocateDoc(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String type) throws IOException {

        return ResponseEntity.ok(
                documentService.uploadForAdvocate(file, name, type, auth.currentUserId()));
    }

    // Download as an attachment
    @GetMapping("/{id}/download")
    public ResponseEntity<InputStreamResource> download(@PathVariable String id) throws IOException {
        return stream(id, "attachment");
    }

    // Same file served inline for the preview window
    @GetMapping("/{id}/preview")
    public ResponseEntity<InputStreamResource> preview(@PathVariable String id) throws IOException {
        return stream(id, "inline");
    }

    // Body of a rename request
    public record RenameRequest(String name) {}

    // Change the name shown for a document (case, client, advocate or evidence file)
    @PutMapping("/{id}/name")
    public ResponseEntity<DocumentDto> rename(@PathVariable String id, @RequestBody RenameRequest req) {
        return ResponseEntity.ok(documentService.rename(id, req.name(), auth.currentUserId()));
    }

    // Delete the document and its stored file
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        documentService.delete(id, auth.currentUserId());
        hearingRepo.clearOrderDoc(id);
        return ResponseEntity.noContent().build();
    }

    // File name offered on download: the name the document now has, with the extension of the uploaded file added when
    // the name has none, so a renamed file still opens in the right program
    private static String downloadName(DocumentMeta meta) {
        String original = meta.getFileName();
        String name = meta.getName() == null ? "" : meta.getName().trim().replaceAll("[\\\\/:*?\"<>|]", "_");
        if (name.isEmpty()) return original != null && !original.isBlank() ? original : "document";

        int dot = original == null ? -1 : original.lastIndexOf('.');
        String ext = dot > 0 && dot < original.length() - 1 ? original.substring(dot) : "";
        return !ext.isEmpty() && !name.toLowerCase().endsWith(ext.toLowerCase()) ? name + ext : name;
    }

    // Shared by download and preview, only the Content-Disposition differs
    private ResponseEntity<InputStreamResource> stream(String id, String disposition) throws IOException {

        DocumentMeta meta = documentService.getMeta(id);
        InputStream file  = documentService.getBinary(id, auth.currentUserId());

        String fileName = downloadName(meta);
        String encoded  = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        disposition + "; filename*=UTF-8''" + encoded)
                .header(HttpHeaders.CONTENT_TYPE,
                        meta.getMimeType() != null
                                ? meta.getMimeType()
                                : MediaType.APPLICATION_OCTET_STREAM_VALUE)
                .contentLength(meta.getSizeBytes())
                .body(new InputStreamResource(file));
    }
}
