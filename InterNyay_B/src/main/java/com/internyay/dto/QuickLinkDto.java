package com.internyay.dto;

import lombok.*;

import java.util.List;

public class QuickLinkDto {

    private QuickLinkDto() {}

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class Link {
        private Long id;
        private Long groupId;
        private String label;
        private String description;
        private String url;
        private String icon;
        private Boolean enabled;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class Group {
        private Long id;
        private String title;
        private List<Link> links;
    }

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class Directory {
        private List<Group> groups;
    }
}
