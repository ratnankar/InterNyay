package com.internyay.service;

import com.internyay.storage.FileStorage;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.NoSuchElementException;

// Reads and writes whole PDFs in file storage for the admin managed PDFs (legal forms, court calendars)
@Service
@RequiredArgsConstructor
public class StoredPdfFiles {

    private final FileStorage storage;

    // Saves the bytes in a folder and returns the new storage key
    public String save(String folder, byte[] bytes) {
        String key = FileStorage.newKey(folder);
        storage.put(key, new java.io.ByteArrayInputStream(bytes), bytes.length, MediaType.APPLICATION_PDF_VALUE);
        return key;
    }

    // Streams an uploaded file straight into storage without loading it into memory
    public String save(String folder, MultipartFile file) {
        String key = FileStorage.newKey(folder);
        try (InputStream in = file.getInputStream()) {
            storage.put(key, in, file.getSize(), MediaType.APPLICATION_PDF_VALUE);
        } catch (IOException e) {
            throw new com.internyay.exception.StorageException("Could not save the file", e);
        }
        return key;
    }

    // Opens a file for streaming to the browser, the caller closes it (Spring does this for a Resource body).
    // Throws NoSuchElementException when there is no file, before any response is sent
    public InputStream open(String key) {
        if (key == null || key.isBlank()) {
            throw new NoSuchElementException("No file is attached to this record");
        }
        return storage.open(key);
    }

    // The whole file as bytes, only for work that needs the full PDF in memory (filling, rendering)
    public byte[] read(String key) {
        if (key == null || key.isBlank()) {
            throw new NoSuchElementException("No file is attached to this record");
        }
        try (InputStream in = storage.open(key)) {
            return in.readAllBytes();
        } catch (IOException e) {
            throw new com.internyay.exception.StorageException("Could not read the file", e);
        }
    }

    // Deletes a file, a missing key is ignored
    public void delete(String key) {
        if (key == null || key.isBlank()) return;
        storage.delete(key);
    }
}
