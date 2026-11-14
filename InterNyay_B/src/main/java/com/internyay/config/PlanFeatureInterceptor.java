package com.internyay.config;

import com.internyay.controller.AuthHelper;
import com.internyay.entity.User;
import com.internyay.service.PlanService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.LinkedHashMap;
import java.util.Map;

// Blocks API calls to features that are not part of the user's plan
@Component
@RequiredArgsConstructor
public class PlanFeatureInterceptor implements HandlerInterceptor {

    private final PlanService plans;
    private final AuthHelper auth;

    // URL pattern -> feature key that the plan must include
    private static final Map<String, String> RULES = new LinkedHashMap<>();
    static {
        RULES.put("^/api/documents(/.*)?$",              "documents");
        RULES.put("^/api/(cases|clients)/[^/]+/documents(/.*)?$", "documents");
        RULES.put("^/api/misc-applications(/.*)?$",       "documents");
        RULES.put("^/api/office-expenses(/.*)?$",        "office_expenses");
        RULES.put("^/api/legal-forms(/.*)?$",            "legal_forms");
        RULES.put("^/api/fee-calculator(/.*)?$",         "court_fee_calculator");
        RULES.put("^/api/chat(/.*)?$",                   "chat_assistant");
        RULES.put("^/api/whatsapp/(cases|send)(/.*)?$",  "whatsapp_reminders");
        RULES.put("^/api/corporate/firm(/.*)?$",         "corporate");
    }

    // Endpoints a firm without a plan can still use: sign-in and account, the plan screen, the contact form, public data
    private static boolean firmMayCall(String path) {
        return path.startsWith("/api/auth/") || path.startsWith("/api/plans/") || path.startsWith("/api/public/")
                || path.equals("/api/contact") || path.startsWith("/api/contact/");
    }

    // Runs before every /api request
    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        // Preflight requests are always allowed
        if ("OPTIONS".equalsIgnoreCase(req.getMethod())) return true;
        String path = req.getRequestURI();

        // A corporate firm without a usable plan (none assigned yet, or the plan is disabled / coming soon) is locked out of
        // the whole API except sign-in, its own account, the plan screen and the contact form
        Authentication who = SecurityContextHolder.getContext().getAuthentication();
        boolean signedIn = who != null && who.isAuthenticated() && !"anonymousUser".equals(who.getPrincipal());
        if (signedIn && !firmMayCall(path)) {
            User account = auth.currentAccount();
            if (!account.isAdmin() && plans.firmBlockReason(account) != null) {
                throw new AccessDeniedException(
                        "Your corporate account has no active plan yet. Choose a plan to start using InterNyay.");
            }
        }

        // Find the feature this URL belongs to
        String key = null;
        for (var e : RULES.entrySet()) {
            if (path.matches(e.getKey())) { key = e.getValue(); break; }
        }
        // URL is not tied to any plan feature
        if (key == null) return true;

        // Skip anonymous requests, security config handles those
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a == null || !a.isAuthenticated() || "anonymousUser".equals(a.getPrincipal())) return true;

        // Admin is never blocked
        User me = auth.currentAccount();
        if (me.isAdmin()) return true;
        // Associates use the plan of their advocate
        User advocate = me.isAssociate() && me.getAdvocate() != null ? me.getAdvocate() : me;
        if (!plans.hasFeature(advocate, key)) {
            throw new AccessDeniedException(
                    "This feature is not included in your plan. Upgrade your plan to use it.");
        }
        return true;
    }
}
