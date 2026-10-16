package com.internyay.entity;

// Quick Access sections that have a PDF for each district
public enum RosterSection {

    JUDGES_LIST,
    BAIL_ROSTER,
    DUTY_MAGISTRATE;

    // Reads the section from text, accepts forms like bail-roster or "bail roster"
    public static RosterSection parse(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Section is required (JUDGES_LIST, BAIL_ROSTER or DUTY_MAGISTRATE)");
        }

        String normalised = value.trim().toUpperCase().replace('-', '_').replace(' ', '_');
        try {
            return valueOf(normalised);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException(
                    "Unknown section \"" + value + "\" — use JUDGES_LIST, BAIL_ROSTER or DUTY_MAGISTRATE");
        }
    }
}
