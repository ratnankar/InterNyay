package com.internyay.dto;

import lombok.*;

import java.util.List;

// DTOs for the DRT and consumer jurisdiction directories
public class JurisdictionDto {

    // Only holds the nested classes
    private JurisdictionDto() {}

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    // A DRT tribunal with the police stations it covers
    public static class Tribunal {
        private Long id;
        private String kind;
        private String name;
        private String location;
        private String phone;
        private String districtsLabel;
        private String amountLabel;
        private String jurisdictionText;
        private String note;
        // Station names for display and ids for editing
        private List<String> stations;
        private List<Long> stationIds;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    // A consumer commission with the police stations it covers
    public static class Commission {
        private Long id;
        private String kind;
        private String name;
        private String location;
        private List<String> stations;
        private List<Long> stationIds;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    // All DRT tribunals
    public static class Drt {
        private List<Tribunal> tribunals;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    // All consumer commissions
    public static class Consumer {
        private List<Commission> commissions;
    }
}
