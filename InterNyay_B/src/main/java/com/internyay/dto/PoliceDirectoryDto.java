package com.internyay.dto;

import lombok.*;

import java.util.List;

// Whole police directory in one response: districts, sub divisions and stations
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class PoliceDirectoryDto {

    private List<District> districts;
    // CAW headquarter details
    private CawHeadquarter cawHeadquarter;
    // Note about where the data came from
    private String sourceNote;

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    // An officer's post and contact details
    public static class Office {
        private Long id;
        private String post;
        private String address;
        private String email;
        private String phone;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    // A police district with its senior officers
    public static class District {
        private Long id;
        private String name;
        private String range;
        private String court;
        private String defaultType;
        private String hq;
        private Office dcp;
        private List<Office> addlDcp;
        private Office caw;
        // Sub divisions under the district
        private List<SubDivision> subDivisions;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    // A sub division headed by an ACP
    public static class SubDivision {
        private Long id;
        private String acp;
        private String address;
        private String email;
        private String phone;
        private List<Station> stations;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    // A police station
    public static class Station {
        private Long id;
        private String name;
        private String phone;
        private String email;
        private String address;
        private String pin;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    // CAW cell headquarter
    public static class CawHeadquarter {
        private String post;
        private String address;
        private String note;
    }
}
