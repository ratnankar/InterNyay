package com.internyay.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

// Records every running write (POST / PUT / PATCH / DELETE, uploads included) of a signed-in account in the
// InFlightRegistry for as long as the server is busy with it. The server keeps working on a request even when the
// browser page that sent it was refreshed or closed, so this is the only reliable "still running" signal.
// Chat answers are left out: the chat has its own typing/stop handling and the same question may be asked twice.
@Component
public class InFlightFilter extends OncePerRequestFilter {

    private final InFlightRegistry registry;

    public InFlightFilter(InFlightRegistry registry) {
        this.registry = registry;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String method = request.getMethod();
        boolean writes = "POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method)
                || "PATCH".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method);
        return !writes || request.getRequestURI().startsWith("/api/chat");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a == null || !a.isAuthenticated() || "anonymousUser".equals(a.getName())) {
            chain.doFilter(request, response);
            return;
        }
        String account = a.getName();
        String action = InFlightRegistry.actionName(request.getMethod(), request.getRequestURI(), request.getQueryString());
        registry.start(account, action);
        try {
            chain.doFilter(request, response);
        } finally {
            registry.finish(account, action);
        }
    }
}
