package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "quick_link_groups")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class QuickLinkGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String title;

    @Builder.Default
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
