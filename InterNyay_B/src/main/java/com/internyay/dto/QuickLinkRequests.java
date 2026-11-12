package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.util.List;

public class QuickLinkRequests {

    private QuickLinkRequests() {}

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class GroupRequest {
        @NotBlank @Size(max = 120) private String title;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class LinkRequest {
        @NotNull private Long groupId;
        @NotBlank @Size(max = 200) private String label;
        @Size(max = 500) private String description;
        @NotBlank @Size(max = 1000) @Pattern(regexp = "^https?://\\S+$", message = "URL must start with http:// or https://") private String url;
        @NotBlank @Pattern(regexp = "^[a-z0-9-]{1,40}$") private String icon;
        private Boolean enabled;
    }

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class OrderRequest {
        @NotEmpty private List<Long> ids;
    }
}
