package com.internyay.exception;

// Thrown when the chat assistant is not configured or can't be reached
public class ChatUnavailableException extends RuntimeException {

    public ChatUnavailableException(String message) {
        super(message);
    }
}
