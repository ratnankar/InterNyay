package com.internyay.service;

import com.internyay.storage.FileStorage;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.NoSuchElementException;

// Stores PDFs in file storage
@Service
@RequiredArgsConstructor
public class PdfStorageService {

    private static final String PDF_SIGNATURE = "%PDF-";

    private final FileStorage storage;

    // Reference to a stored file
    public record StoredPdf(String storageKey, String fileName, long sizeBytes) {}

    // Save an uploaded PDF
    public StoredPdf store(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("The PDF file is empty");
        }

        try (InputStream head = file.getInputStream()) {
            byte[] bytes = head.readNBytes(PDF_SIGNATURE.length());
            if (!new String(bytes, StandardCharsets.ISO_8859_1).equals(PDF_SIGNATURE)) {
                throw new IllegalArgumentException("Only PDF files are allowed");
            }
        }

        String original = file.getOriginalFilename() != null && !file.getOriginalFilename().isBlank()
                ? file.getOriginalFilename()
                : "document.pdf";

        String key = FileStorage.newKey("district-pdfs");
        try (InputStream in = file.getInputStream()) {
            storage.put(key, in, file.getSize(), MediaType.APPLICATION_PDF_VALUE);
        }

        return new StoredPdf(key, original, file.getSize());
    }

    // Open a stored PDF, the caller closes the stream
    public InputStream open(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            throw new NoSuchElementException("No PDF is attached to this record");
        }
        return storage.open(storageKey);
    }

    // Delete a stored PDF
    public void delete(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) return;
        storage.delete(storageKey);
    }
}
