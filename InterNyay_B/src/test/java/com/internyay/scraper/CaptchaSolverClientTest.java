package com.internyay.scraper;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CaptchaSolverClientTest {

    private static final byte[] IMAGE = {1, 2, 3};

    private HttpServer server;
    private int status;
    private String body;
    private final AtomicReference<String> receivedKey = new AtomicReference<>();
    private final AtomicInteger calls = new AtomicInteger();

    @BeforeEach
    void startServer() throws IOException {
        status = 200;
        body = "{\"text\":\"a1B2c3\"}";
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/solve", exchange -> {
            calls.incrementAndGet();
            receivedKey.set(exchange.getRequestHeaders().getFirst("X-Solver-Key"));
            exchange.getRequestBody().readAllBytes();
            byte[] out = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, out.length);
            exchange.getResponseBody().write(out);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    private CaptchaSolverClient client(boolean enabled, String key) {
        return new CaptchaSolverClient(enabled, "http://127.0.0.1:" + server.getAddress().getPort(), key, 2000, 3);
    }

    @Test
    void returnsTheRecognisedText() {
        assertEquals(Optional.of("a1B2c3"), client(true, "").solve(IMAGE));
    }

    @Test
    void sendsTheKeyWhenConfigured() {
        client(true, "secret").solve(IMAGE);
        assertEquals("secret", receivedKey.get());
    }

    @Test
    void nullTextGivesNothing() {
        body = "{\"text\":null}";
        assertTrue(client(true, "").solve(IMAGE).isEmpty());
    }

    @Test
    void textWithSymbolsIsRefused() {
        body = "{\"text\":\"a1 b2;\"}";
        assertTrue(client(true, "").solve(IMAGE).isEmpty());
    }

    @Test
    void badImageDoesNotPauseTheService() {
        status = 415;
        CaptchaSolverClient client = client(true, "");
        assertTrue(client.solve(IMAGE).isEmpty());
        assertTrue(client.available());
    }

    @Test
    void serverErrorPausesTheService() {
        status = 500;
        CaptchaSolverClient client = client(true, "");
        assertTrue(client.solve(IMAGE).isEmpty());
        assertFalse(client.available());
    }

    @Test
    void unreachableServicePausesTheService() {
        CaptchaSolverClient client = new CaptchaSolverClient(true, "http://127.0.0.1:9", "", 2000, 3);
        assertTrue(client.solve(IMAGE).isEmpty());
        assertFalse(client.available());
    }

    @Test
    void disabledServiceIsNeverCalled() {
        CaptchaSolverClient client = client(false, "");
        assertFalse(client.available());
        assertTrue(client.solve(IMAGE).isEmpty());
        assertEquals(0, calls.get());
    }

    @Test
    void emptyImageIsNotSent() {
        assertTrue(client(true, "").solve(new byte[0]).isEmpty());
        assertEquals(0, calls.get());
    }

    @Test
    void attemptsHaveAFloorOfOne() {
        assertEquals(1, new CaptchaSolverClient(true, "http://127.0.0.1:9", "", 2000, 0).maxAttempts());
    }
}
