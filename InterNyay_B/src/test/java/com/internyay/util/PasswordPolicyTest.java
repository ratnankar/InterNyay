package com.internyay.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// The same cases as passwordPolicy.test.js in the website, so both sides keep giving the same answer
class PasswordPolicyTest {

    @Test
    void acceptsAStrongEnoughPassword() {
        assertThat(PasswordPolicy.problem("Blue42Sky", "a@b.com")).isNull();
        assertThat(PasswordPolicy.problem("correct horse 9 battery", null)).isNull();
    }

    @Test
    void refusesEmptyShortAndTooLongPasswords() {
        assertThat(PasswordPolicy.problem("", null)).contains("required");
        assertThat(PasswordPolicy.problem("Ab1xyz7", null)).contains("at least 8");
        assertThat(PasswordPolicy.problem("a1".repeat(33), null)).contains("at most 64");
    }

    @Test
    void needsALetterAndANumber() {
        assertThat(PasswordPolicy.problem("abcdefghij", null)).contains("letter and one number");
        assertThat(PasswordPolicy.problem("1234567890", null)).contains("letter and one number");
    }

    @Test
    void refusesCommonPasswordsInAnyCase() {
        assertThat(PasswordPolicy.problem("Password123", null)).contains("too common");
    }

    @Test
    void refusesPasswordsBuiltFromTheEmailButIgnoresVeryShortEmailNames() {
        assertThat(PasswordPolicy.problem("advocate.sharma99", "advocate.sharma@example.com")).contains("email");
        assertThat(PasswordPolicy.problem("Ravi-2024-ok", "ravi@example.com")).isNull();
    }

    @Test
    void requireThrowsWithTheMessage() {
        assertThatThrownBy(() -> PasswordPolicy.require("short1", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Password must be at least 8 characters");
    }
}
