package com.internyay.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.dto.DocumentDto;
import com.internyay.entity.Case;
import com.internyay.entity.Client;
import com.internyay.entity.DocumentMeta;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.ClientRepository;
import com.internyay.repository.DocumentRepository;
import com.internyay.scan.ImageSniffer;
import com.internyay.scan.ScanOcr;
import com.internyay.scan.ScanPdfBuilder;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class ScanDocumentService {

    private static final Pattern UPLOAD_ID = Pattern.compile("[A-Za-z0-9-]{8,64}");
    private static final int MAX_TEXT = 2_000_000;
    private static final int MAX_WORDS_PER_PAGE = 20_000;

    private final CaseRepository caseRepo;
    private final ClientRepository clientRepo;
    private final DocumentRepository docRepo;
    private final DocumentService documentService;
    private final ScanPdfBuilder pdfBuilder;
    private final ObjectMapper objectMapper;

    @Value("${internyay.scan.max-pages:60}")
    private int maxPages;

    @Value("${internyay.scan.max-image-bytes:12582912}")
    private long maxImageBytes;

    public DocumentDto create(List<MultipartFile> pages, String name, String type, Long caseId, Long clientId,
                              String uploadId, String ocrJson, Long userId) throws IOException {

        String upload = uploadId == null ? "" : uploadId.trim();
        if (!UPLOAD_ID.matcher(upload).matches()) {
            throw new IllegalArgumentException("Upload id is invalid");
        }

        Optional<DocumentMeta> existing = docRepo.findByUserIdAndClientUploadId(userId, upload);
        if (existing.isPresent()) {
            return DocumentDto.from(existing.get());
        }

        String title = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        if (title.isEmpty()) {
            throw new IllegalArgumentException("Document name is required");
        }
        if (title.length() > 512) {
            title = title.substring(0, 512);
        }

        String docType = type == null || type.isBlank() ? "Other" : type.trim();
        if (docType.length() > 255) {
            docType = docType.substring(0, 255);
        }
        if (docType.startsWith("Evidence - ") && caseId == null && clientId == null) {
            throw new IllegalArgumentException("Evidence must be attached to a case or client");
        }

        if (pages == null || pages.isEmpty()) {
            throw new IllegalArgumentException("At least one page is required");
        }
        if (pages.size() > maxPages) {
            throw new IllegalArgumentException("A scan can have at most " + maxPages + " pages");
        }

        List<byte[]> images = new ArrayList<>(pages.size());
        for (int i = 0; i < pages.size(); i++) {
            MultipartFile file = pages.get(i);
            if (file == null || file.isEmpty()) {
                throw new IllegalArgumentException("Page " + (i + 1) + " is empty");
            }
            if (file.getSize() > maxImageBytes) {
                throw new IllegalArgumentException("Page " + (i + 1) + " is too large");
            }
            byte[] bytes = file.getBytes();
            if (!ImageSniffer.isSupported(bytes)) {
                throw new IllegalArgumentException("Page " + (i + 1) + " must be a JPEG or PNG image");
            }
            images.add(bytes);
        }

        Long resolvedClientId = clientId;
        if (caseId != null) {
            Case legalCase = caseRepo.findById(caseId)
                    .orElseThrow(() -> new NoSuchElementException("Case not found"));
            if (legalCase.getUser() == null || !legalCase.getUser().getId().equals(userId)) {
                throw new NoSuchElementException("Case not found");
            }
            if (resolvedClientId == null && legalCase.getClient() != null) {
                resolvedClientId = legalCase.getClient().getId();
            }
        }
        if (resolvedClientId != null) {
            Client client = clientRepo.findById(resolvedClientId)
                    .orElseThrow(() -> new NoSuchElementException("Client not found"));
            if (client.getUser() == null || !client.getUser().getId().equals(userId)) {
                throw new NoSuchElementException("Client not found");
            }
        }

        ScanOcr ocr = parse(ocrJson);
        String text = ocr == null || ocr.text() == null ? "" : ocr.text();
        if (text.length() > MAX_TEXT) {
            text = text.substring(0, MAX_TEXT);
        }

        byte[] pdf = pdfBuilder.build(images, ocr);
        String fileName = title.toLowerCase().endsWith(".pdf") ? title : title + ".pdf";

        DocumentService.ScanMeta meta = new DocumentService.ScanMeta(
                upload,
                images.size(),
                text.isBlank() ? "NONE" : "DONE",
                ocr == null ? null : truncate(ocr.language(), 20),
                ocr == null ? null : ocr.confidence());

        try {
            return documentService.storeScan(pdf, fileName, title, docType, caseId, resolvedClientId, userId, meta, text);
        } catch (DataIntegrityViolationException e) {
            return docRepo.findByUserIdAndClientUploadId(userId, upload)
                    .map(DocumentDto::from)
                    .orElseThrow(() -> e);
        }
    }

    private ScanOcr parse(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            ScanOcr ocr = objectMapper.readValue(json, ScanOcr.class);
            if (ocr.pages() != null) {
                for (ScanOcr.Page page : ocr.pages()) {
                    if (page != null && page.words() != null && page.words().size() > MAX_WORDS_PER_PAGE) {
                        throw new IllegalArgumentException("OCR data is too large");
                    }
                }
            }
            return ocr;
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("OCR data is not valid");
        }
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
