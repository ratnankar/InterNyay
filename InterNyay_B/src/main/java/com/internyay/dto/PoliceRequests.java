package com.internyay.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

// Request bodies used by the admin to manage the police directory
public final class PoliceRequests {

    // Only holds the nested classes
    private PoliceRequests() {}

    @Data
    // Post and contact details of an officer
    public static class Office {
        @Size(max = 200) private String post;
        @Size(max = 500) private String address;
        @Size(max = 200) private String email;
        @Size(max = 100) private String phone;
    }

    @Data
    // Add or edit a police district
    public static class DistrictRequest {
        @NotBlank @Size(max = 100) private String name;
        @Size(max = 100) private String range;
        @Size(max = 100) private String court;
        @Size(max = 50)  private String defaultType;
        @Size(max = 500) private String hq;
        @Valid private Office dcp;
        @Valid private Office caw;
        @Valid private List<Office> addlDcp;
    }

    @Data
    // Add or edit a sub division
    public static class SubDivisionRequest {
        @NotNull private Long districtId;
        @NotBlank @Size(max = 200) private String acp;
        @Size(max = 500) private String address;
        @Size(max = 200) private String email;
        @Size(max = 100) private String phone;
    }

    @Data
    // Add or edit a police station
    public static class StationRequest {
        @NotNull private Long subDivisionId;
        @NotBlank @Size(max = 150) private String name;
        @Size(max = 100) private String phone;
        @Size(max = 200) private String email;
        @Size(max = 500) private String address;
        @Size(max = 10)  private String pin;
    }

    @Data
    // CAW headquarter and the source note
    public static class SettingsRequest {
        @Size(max = 200)  private String cawHqPost;
        @Size(max = 500)  private String cawHqAddress;
        @Size(max = 1000) private String cawHqNote;
        @Size(max = 2000) private String sourceNote;
    }
}
