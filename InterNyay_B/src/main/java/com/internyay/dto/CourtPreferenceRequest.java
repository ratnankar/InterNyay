package com.internyay.dto;

import lombok.*;

import java.util.List;

// Courts picked on the profile or right after sign-up; an empty list clears the preference
@Data @NoArgsConstructor @AllArgsConstructor
public class CourtPreferenceRequest {
    private List<Long> courtIds;
}
