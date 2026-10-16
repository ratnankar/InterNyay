package com.internyay.config;

import com.internyay.controller.AuthHelper;
import com.internyay.entity.User;
import com.internyay.service.PlanService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

// Blocks API calls to features that are not in the user's plan
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PlanFeatureInterceptorTest {

    @Mock PlanService plans;
    @Mock AuthHelper auth;

    private PlanFeatureInterceptor interceptor;
    private final MockHttpServletResponse res = new MockHttpServletResponse();

    @BeforeEach
    void setUp() {
        interceptor = new PlanFeatureInterceptor(plans, auth);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("1", null, AuthorityUtils.createAuthorityList("ROLE_ADVOCATE")));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static User account(String role) {
        User u = new User();
        u.setId(1L);
        u.setRole(role);
        return u;
    }

    private boolean pre(String method, String uri) {
        return interceptor.preHandle(new MockHttpServletRequest(method, uri), res, new Object());
    }

    @Test
    void urlWithoutAPlanFeatureIsAlwaysAllowed() {
        assertThat(pre("GET", "/api/cases")).isTrue();
        verifyNoInteractions(plans);
    }

    @Test
    void preflightRequestIsAllowed() {
        assertThat(pre("OPTIONS", "/api/fee-calculator/config")).isTrue();
        verifyNoInteractions(plans);
    }

    @Test
    void anonymousRequestIsLeftToTheSecurityConfig() {
        SecurityContextHolder.getContext().setAuthentication(new AnonymousAuthenticationToken(
                "key", "anonymousUser", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));

        assertThat(pre("GET", "/api/fee-calculator/config")).isTrue();
        verifyNoInteractions(plans);
    }

    @Test
    void noAuthenticationAtAllIsLeftToTheSecurityConfig() {
        SecurityContextHolder.clearContext();

        assertThat(pre("GET", "/api/fee-calculator/config")).isTrue();
    }

    @Test
    void adminIsNeverBlocked() {
        when(auth.currentAccount()).thenReturn(account(User.ADMIN));

        assertThat(pre("GET", "/api/fee-calculator/config")).isTrue();
        verifyNoInteractions(plans);
    }

    @Test
    void advocateWithTheFeatureIsAllowed() {
        User me = account(User.ADVOCATE);
        when(auth.currentAccount()).thenReturn(me);
        when(plans.hasFeature(me, "court_fee_calculator")).thenReturn(true);

        assertThat(pre("GET", "/api/fee-calculator/config")).isTrue();
    }

    @Test
    void advocateWithoutTheFeatureGetsAccessDenied() {
        User me = account(User.ADVOCATE);
        when(auth.currentAccount()).thenReturn(me);
        when(plans.hasFeature(me, "court_fee_calculator")).thenReturn(false);

        assertThatThrownBy(() -> pre("GET", "/api/fee-calculator/config"))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("not included in your plan");
    }

    @Test
    void associateIsCheckedAgainstTheAdvocatesPlan() {
        User advocate = account(User.ADVOCATE);
        advocate.setId(7L);
        User associate = account(User.ASSOCIATE);
        associate.setAdvocate(advocate);
        when(auth.currentAccount()).thenReturn(associate);
        when(plans.hasFeature(advocate, "chat_assistant")).thenReturn(true);
        when(plans.hasFeature(associate, "chat_assistant")).thenReturn(false);

        assertThat(pre("POST", "/api/chat")).isTrue();
    }

    @Test
    void eachUrlPatternMapsToItsFeature() {
        User me = account(User.ADVOCATE);
        when(auth.currentAccount()).thenReturn(me);

        String[][] expected = {
                {"/api/documents", "documents"},
                {"/api/documents/5/download", "documents"},
                {"/api/cases/9/documents", "documents"},
                {"/api/clients/3/documents/4", "documents"},
                {"/api/office-expenses", "office_expenses"},
                {"/api/legal-forms/12", "legal_forms"},
                {"/api/fee-calculator/config", "court_fee_calculator"},
                {"/api/chat/messages", "chat_assistant"},
                {"/api/whatsapp/send", "whatsapp_reminders"},
                {"/api/whatsapp/cases/5", "whatsapp_reminders"},
        };
        for (String[] e : expected) {
            // Only the feature that belongs to this URL is switched on, so a wrong mapping would be refused
            when(plans.hasFeature(me, "documents")).thenReturn(e[1].equals("documents"));
            when(plans.hasFeature(me, "office_expenses")).thenReturn(e[1].equals("office_expenses"));
            when(plans.hasFeature(me, "legal_forms")).thenReturn(e[1].equals("legal_forms"));
            when(plans.hasFeature(me, "court_fee_calculator")).thenReturn(e[1].equals("court_fee_calculator"));
            when(plans.hasFeature(me, "chat_assistant")).thenReturn(e[1].equals("chat_assistant"));
            when(plans.hasFeature(me, "whatsapp_reminders")).thenReturn(e[1].equals("whatsapp_reminders"));

            assertThat(pre("GET", e[0])).as(e[0]).isTrue();
        }
    }

    @Test
    void similarLookingUrlsAreNotTiedToAFeature() {
        assertThat(pre("GET", "/api/documentsx")).isTrue();
        assertThat(pre("GET", "/api/whatsapp/status")).isTrue();
        verifyNoInteractions(plans);
    }
}
