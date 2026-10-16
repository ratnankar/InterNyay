package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// One choice in a dropdown that the admin manages (case relief, document type, specialization and so on)
@Entity
@Table(name = "option_items")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class OptionItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Which dropdown this choice belongs to, see OptionService.LISTS
    @Column(name = "list_key", nullable = false, length = 40)
    private String listKey;

    // Parent choice for cascading lists (relief under a nature, case type under nature||relief), empty otherwise
    @Builder.Default
    @Column(nullable = false, length = 300)
    private String parent = "";

    // Saved value, this is the text stored on cases and clients
    @Column(nullable = false)
    private String value;

    // Text shown in the dropdown
    @Column(nullable = false)
    private String label;

    @Builder.Default
    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    // Hidden choices stay in the table but are not offered any more
    @Builder.Default
    @Column(nullable = false)
    private boolean enabled = true;

    // Locked choices are used by the code, so they can be renamed on screen but not hidden or deleted
    @Builder.Default
    @Column(nullable = false)
    private boolean locked = false;
}
