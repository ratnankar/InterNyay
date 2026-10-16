package com.internyay.exception;

// Thrown when too many wrong passwords were tried, answered with HTTP 429
public class TooManyAttemptsException extends RuntimeException {
    public TooManyAttemptsException(String message) {
        super(message);
    }
}
