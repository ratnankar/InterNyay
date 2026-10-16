package com.internyay.dto;

import lombok.*;

import java.util.List;

// The courts a user works at, as shown in the app by default
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class CourtPreferenceDto {

    // Ids the user chose (empty when nothing was chosen yet)
    public List<Long> saved;

    // True when the user chose at least one court. False means the courts below come from the case counts
    public boolean custom;

    // Courts to use by default, the one with the most cases first. Chosen courts when custom, otherwise the
    // courts that have cases
    public List<Place> effective;

    // The first of effective, null when the user has no preference and no cases yet
    public Long defaultId;

    // One court + district (or a high court) with the number of the user's cases filed there
    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class Place {
        public Long id;
        public String court;
        public String district;
        public long cases;
    }
}
