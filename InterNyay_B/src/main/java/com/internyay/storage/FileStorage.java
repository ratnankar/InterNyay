package com.internyay.storage;

import java.io.InputStream;
import java.util.UUID;

// Where uploaded files live. The database only keeps the storage key of each file.
// Two implementations: LocalFileStorage (disk) and S3FileStorage (any S3 compatible bucket)
public interface FileStorage {

    // A new unique key inside a folder, like documents/3f2a9c1e-...
    // The key never contains the uploaded file name, so user input can't change where a file goes
    static String newKey(String folder) {
        return folder + "/" + UUID.randomUUID();
    }

    // Save a file under the key
    void put(String key, InputStream data, long sizeBytes, String contentType);

    // Open a stored file for reading, the caller closes the stream.
    // Throws NoSuchElementException when the file does not exist
    InputStream open(String key);

    // Delete a file, a missing file is not an error
    void delete(String key);
}
