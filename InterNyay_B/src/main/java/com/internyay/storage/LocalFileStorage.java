package com.internyay.storage;

import com.internyay.exception.StorageException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.NoSuchElementException;

// Keeps files in a folder on the server's disk. Fine for development and for a single server
// with a persistent disk. Use S3FileStorage when the server's disk is temporary or there are several servers
@Slf4j
@Service
@ConditionalOnProperty(name = "internyay.storage.type", havingValue = "local", matchIfMissing = true)
public class LocalFileStorage implements FileStorage {

    private final Path root;

    public LocalFileStorage(@Value("${internyay.storage.local-dir:./data/uploads}") String dir) {
        this.root = Path.of(dir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new StorageException("Could not create the upload folder " + root, e);
        }
        log.info("File storage: local folder {}", root);
    }

    @Override
    public void put(String key, InputStream data, long sizeBytes, String contentType) {
        Path target = resolve(key);
        Path tmp = null;
        try {
            Files.createDirectories(target.getParent());
            // Written to a temp file first so a half uploaded file is never visible under the real key
            tmp = Files.createTempFile(target.getParent(), ".upload-", ".tmp");
            Files.copy(data, tmp, StandardCopyOption.REPLACE_EXISTING);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
            tmp = null;
        } catch (IOException e) {
            throw new StorageException("Could not save the file", e);
        } finally {
            if (tmp != null) {
                try { Files.deleteIfExists(tmp); } catch (IOException ignored) { }
            }
        }
    }

    @Override
    public InputStream open(String key) {
        Path file = resolve(key);
        if (!Files.isRegularFile(file)) {
            throw new NoSuchElementException("Stored file not found");
        }
        try {
            return Files.newInputStream(file);
        } catch (IOException e) {
            throw new StorageException("Could not read the file", e);
        }
    }

    @Override
    public void delete(String key) {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException | RuntimeException e) {
            log.warn("Could not delete stored file {}: {}", key, e.getMessage());
        }
    }

    // Turns a key into a path and makes sure it stays inside the upload folder
    private Path resolve(String key) {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("Invalid storage key");
        }
        Path p = root.resolve(key).normalize();
        if (!p.startsWith(root) || p.equals(root)) {
            throw new IllegalArgumentException("Invalid storage key");
        }
        return p;
    }
}
