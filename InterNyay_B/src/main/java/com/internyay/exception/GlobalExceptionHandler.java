package com.internyay.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.io.IOException;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

// Turns exceptions into JSON {"message": ...} responses with the right status
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    // 400, validation failed on a request body
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {

        String message = ex.getBindingResult().getAllErrors().stream()
                .map(e -> (e instanceof FieldError fe ? fe.getField() + ": " : "")
                        + e.getDefaultMessage())
                .collect(Collectors.joining(", "));

        return ResponseEntity.badRequest().body(Map.of("message", message));
    }

    // 400, validation failed on form or query params
    @ExceptionHandler(BindException.class)
    public ResponseEntity<Map<String, String>> handleBind(BindException ex) {

        String message = ex.getBindingResult().getAllErrors().stream()
                .map(e -> (e instanceof FieldError fe ? fe.getField() + ": " : "")
                        + e.getDefaultMessage())
                .collect(Collectors.joining(", "));

        return ResponseEntity.badRequest().body(Map.of("message", message));
    }

    // 401, wrong email or password
    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<Map<String, String>> handleBadCredentials(BadCredentialsException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("message", "Invalid email or password"));
    }

    // 429, too many wrong passwords
    @ExceptionHandler(TooManyAttemptsException.class)
    public ResponseEntity<Map<String, String>> handleTooMany(TooManyAttemptsException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(Map.of("message", ex.getMessage()));
    }

    // 403, account is deactivated
    @ExceptionHandler(DisabledException.class)
    public ResponseEntity<Map<String, String>> handleDisabled(DisabledException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("message", "This account has been deactivated"));
    }

    // 403, plan messages are shown as they are, others get a generic one
    @ExceptionHandler({AccessDeniedException.class, SecurityException.class})
    public ResponseEntity<Map<String, String>> handleForbidden(Exception ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("message", ex.getMessage() != null && ex.getMessage().contains("your plan")
                        ? ex.getMessage() : "You do not have permission to do that"));
    }

    // 404, record not found
    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("message", msg(ex, "Not found")));
    }

    // 503, chat assistant is down or not set up
    @ExceptionHandler(ChatUnavailableException.class)
    public ResponseEntity<Map<String, String>> handleChatUnavailable(ChatUnavailableException ex) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("message", msg(ex, "The assistant is unavailable")));
    }

    // 413, uploaded file is over the limit
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> handleTooLarge(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("message", "File is too large (limit is 50MB)"));
    }

    // 503, the file store (disk or S3 bucket) could not be read or written
    @ExceptionHandler(StorageException.class)
    public ResponseEntity<Map<String, String>> handleStorage(StorageException ex) {
        log.error("File storage error", ex);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("message", "File storage is unavailable right now. Please try again in a moment."));
    }

    // 500, file read or write failed
    @ExceptionHandler(IOException.class)
    public ResponseEntity<Map<String, String>> handleIO(IOException ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("message", "Could not read or store the file — " + msg(ex, "unknown I/O error")));
    }

    // 400, bad input from the user
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArg(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("message", msg(ex, "Bad request")));
    }

    // Other runtime errors, status is guessed from the message
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, String>> handleRuntime(RuntimeException ex) {

        String message = msg(ex, "Something went wrong");

        HttpStatus status = message.contains("Forbidden")
                ? HttpStatus.FORBIDDEN
                : message.contains("not found") || message.contains("Not found")
                    ? HttpStatus.NOT_FOUND
                    : HttpStatus.INTERNAL_SERVER_ERROR;

        return ResponseEntity.status(status).body(Map.of("message", message));
    }

    // Last fallback for anything not handled above
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleAny(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("message", msg(ex, ex.getClass().getSimpleName())));
    }

    // Message of the exception or the fallback when it is empty
    private String msg(Exception ex, String fallback) {
        return (ex.getMessage() == null || ex.getMessage().isBlank()) ? fallback : ex.getMessage();
    }
}
