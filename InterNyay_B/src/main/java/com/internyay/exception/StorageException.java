package com.internyay.exception;

// The file store (disk or S3 bucket) could not be read or written
public class StorageException extends RuntimeException {

    public StorageException(String message, Throwable cause) {
        super(message, cause);
    }
}
