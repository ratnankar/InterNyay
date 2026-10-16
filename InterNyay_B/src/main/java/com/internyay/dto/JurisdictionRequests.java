package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.util.List;

// Request bodies used by the admin for the DRT and consumer directories
public class JurisdictionRequests {

    // Only holds the nested classes
    private JurisdictionRequests() {}

    @Data @NoArgsConstructor @AllArgsConstructor
    // Add or edit a DRT tribunal
    public static class TribunalRequest {
        @Size(max = 20) private String kind;
        @NotBlank @Size(max = 300) private String name;
        @Size(max = 500) private String location;
        @Size(max = 100) private String phone;
        @Size(max = 500) private String districtsLabel;
        @Size(max = 200) private String amountLabel;
        private String jurisdictionText;
        private String note;
        // Police stations the tribunal covers
        private List<Long> stationIds;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    // Add or edit a consumer commission
    public static class CommissionRequest {
        @Size(max = 20) private String kind;
        @NotBlank @Size(max = 300) private String name;
        @Size(max = 500) private String location;
        // Police stations the commission covers
        private List<Long> stationIds;
    }
}
