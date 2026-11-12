package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "quick_links")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class QuickLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private QuickLinkGroup group;

    @Column(nullable = false, length = 200)
    private String label;

    @Column(length = 500)
    private String description;

    @Column(nullable = false, length = 1000)
    private String url;

    @Builder.Default
    @Column(nullable = false, length = 40)
    private String icon = "clip";

    @Builder.Default
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Builder.Default
    @Column(nullable = false)
    private Boolean enabled = true;
}
