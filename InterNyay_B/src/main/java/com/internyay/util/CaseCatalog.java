package com.internyay.util;

import java.util.List;

// Fixed values used for case nature and client side
public final class CaseCatalog {

    // Allowed case natures
    public static final List<String> NATURES = List.of("Civil", "Criminal");

    // Relief sought value for a police challan case
    public static final String POLICE_CHALLAN = "Police Challan";

    // Case type for a cheque bounce complaint
    public static final String NI_ACT_138_COMPLAINT = "Complaint under Sec 138 of NI Act";

    // Relief sought value of family disputes (civil "Family Disputes", criminal "Family disputes")
    public static final String FAMILY_DISPUTES = "Family Disputes";

    // Sides our client can be on
    public static final String SIDE_COMPLAINANT = "COMPLAINANT";

    public static final String SIDE_ACCUSED = "ACCUSED";

    // All allowed client sides
    public static final List<String> CLIENT_SIDES = List.of(SIDE_COMPLAINANT, SIDE_ACCUSED);

    // Utility class, no objects
    private CaseCatalog() {}

    // Returns the nature in its proper spelling, throws when it is invalid
    public static String canonicalNature(String value) {
        if (value == null || value.isBlank()) return null;

        String wanted = value.trim();
        return NATURES.stream()
                .filter(n -> n.equalsIgnoreCase(wanted))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Case nature must be one of " + String.join(", ", NATURES)));
    }

    // True when the relief sought is a police challan
    public static boolean isPoliceChallan(String reliefSought) {
        return reliefSought != null && POLICE_CHALLAN.equalsIgnoreCase(reliefSought.trim());
    }

    // True when the relief sought is a family dispute, spelling and case are ignored
    public static boolean isFamilyDispute(String reliefSought) {
        return reliefSought != null && FAMILY_DISPUTES.equalsIgnoreCase(reliefSought.trim());
    }

    // True when the case type is a Sec 138 NI Act complaint
    public static boolean isNiAct138Complaint(String caseType) {
        return caseType != null && NI_ACT_138_COMPLAINT.equalsIgnoreCase(caseType.trim());
    }

    // Returns the client side in its proper spelling, throws when it is invalid
    public static String canonicalSide(String value) {
        if (value == null || value.isBlank()) return null;

        String wanted = value.trim();
        return CLIENT_SIDES.stream()
                .filter(s -> s.equalsIgnoreCase(wanted))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Client side must be one of " + String.join(", ", CLIENT_SIDES)));
    }
}
