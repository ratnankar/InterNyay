package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

// Request bodies for the 4-digit PIN that guards the Transactions page
public final class TxnPinRequests {

    // Only holds the nested classes
    private TxnPinRequests() {}

    private static final String PIN_REGEX = "^\\d{4}$";
    private static final String PIN_MESSAGE = "PIN must be exactly 4 digits";

    // Opening the Transactions page
    @Data
    public static class Verify {
        @NotBlank(message = "Enter your PIN")
        @Pattern(regexp = PIN_REGEX, message = PIN_MESSAGE)
        private String pin;
    }

    // Changing the PIN: the old PIN proves it's the owner
    @Data
    public static class Change {
        @NotBlank(message = "Enter your current PIN")
        @Pattern(regexp = PIN_REGEX, message = "Current PIN must be exactly 4 digits")
        private String currentPin;

        @NotBlank(message = "Enter a new PIN")
        @Pattern(regexp = PIN_REGEX, message = PIN_MESSAGE)
        private String newPin;
    }

    // Creating or resetting the PIN. The first PIN needs only the new PIN (no password).
    // Resetting a forgotten PIN needs the account password, or a fresh Google token for Google sign-ups, who have no password
    @Data
    public static class Reset {
        private String password;

        private String googleIdToken;

        @NotBlank(message = "Enter a new PIN")
        @Pattern(regexp = PIN_REGEX, message = PIN_MESSAGE)
        private String newPin;
    }
}
