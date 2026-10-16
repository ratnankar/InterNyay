package com.internyay.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.SequenceInputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

// Stops a double save: while a save from one user is still running, an identical second save
// (same user, same endpoint, same JSON body) is answered with HTTP 409 instead of being saved again.
// Covers a double click on a slow PC, a second browser tab and an automatic network retry.
// Once the first save finishes, the same data can be saved again normally.
@Component
public class DuplicateSubmitFilter extends OncePerRequestFilter {

    // Only JSON bodies up to this size are compared; file uploads (multipart) are not touched
    private static final int MAX_BODY_BYTES = 1_000_000;

    // Saves that are running right now (user + method + address + body fingerprint)
    private final Set<String> running = ConcurrentHashMap.newKeySet();
    private final ObjectMapper objectMapper;

    public DuplicateSubmitFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    // Chat answers can be slow and the same question may be asked twice on purpose, so chat is left alone
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String method = request.getMethod();
        boolean writes = "POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method)
                || "PATCH".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method);
        String type = request.getContentType();
        boolean jsonOrEmpty = type == null || type.toLowerCase().startsWith(MediaType.APPLICATION_JSON_VALUE);
        return !writes || !jsonOrEmpty || request.getRequestURI().startsWith("/api/chat");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        // Too large to compare: let it through as usual
        if (request.getContentLengthLong() > MAX_BODY_BYTES) {
            chain.doFilter(request, response);
            return;
        }

        // Read at most MAX_BODY_BYTES + 1 bytes. A request with no Content-Length header (chunked) used to be read
        // completely into memory here, before any login check, so one large anonymous upload could exhaust the heap
        byte[] head = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
        if (head.length > MAX_BODY_BYTES) {
            // Too large to compare: hand the controller the bytes already read followed by the rest of the stream
            chain.doFilter(new CachedBodyRequest(request, head, request.getInputStream()), response);
            return;
        }

        CachedBodyRequest wrapped = new CachedBodyRequest(request, head, null);
        String key = fingerprint(wrapped);

        // Another identical save from this user is still running
        if (!running.add(key)) {
            response.setStatus(HttpStatus.CONFLICT.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            objectMapper.writeValue(response.getWriter(), Map.of(
                    "message", "This was already submitted and is still being saved. Please wait a moment."));
            return;
        }

        try {
            chain.doFilter(wrapped, response);
        } finally {
            running.remove(key);
        }
    }

    // Who + what + where: login token, method, address with query, and a hash of the body
    private String fingerprint(CachedBodyRequest request) {
        String auth = String.valueOf(request.getHeader("Authorization"));
        String query = request.getQueryString() == null ? "" : "?" + request.getQueryString();
        return sha256(auth) + "|" + request.getMethod() + "|" + request.getRequestURI() + query + "|" + sha256(request.body());
    }

    private static String sha256(String text) {
        return sha256(text.getBytes(StandardCharsets.UTF_8));
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    // Request copy whose body was read once up front, so the controller can still read it afterwards
    private static final class CachedBodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;
        // The bytes already read, followed by whatever is left of the original stream (only for oversized bodies)
        private final InputStream source;

        CachedBodyRequest(HttpServletRequest request, byte[] body, InputStream rest) {
            super(request);
            this.body = body;
            ByteArrayInputStream head = new ByteArrayInputStream(body);
            this.source = rest == null ? head : new SequenceInputStream(head, rest);
        }

        byte[] body() {
            return body;
        }

        @Override
        public ServletInputStream getInputStream() {
            InputStream in = source;
            return new ServletInputStream() {
                private boolean finished;

                @Override public int read() throws IOException {
                    int b = in.read();
                    if (b == -1) finished = true;
                    return b;
                }
                @Override public int read(byte[] b, int off, int len) throws IOException {
                    int n = in.read(b, off, len);
                    if (n == -1) finished = true;
                    return n;
                }
                @Override public boolean isFinished() { return finished; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) { /* blocking reads only */ }
            };
        }

        @Override
        public BufferedReader getReader() {
            String enc = getCharacterEncoding();
            Charset charset = enc == null ? StandardCharsets.UTF_8 : Charset.forName(enc);
            return new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }
    }
}
