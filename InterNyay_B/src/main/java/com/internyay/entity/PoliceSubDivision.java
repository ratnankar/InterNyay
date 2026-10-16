package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// A sub division of a police district, headed by an ACP
@Entity
@Table(name = "police_sub_divisions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PoliceSubDivision {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // District it belongs to
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "district_id", nullable = false)
    private PoliceDistrict district;

    // Name of the ACP
    @Column(nullable = false, length = 200)
    private String acp;

    // Contact details
    @Column(length = 500) private String address;
    @Column(length = 200) private String email;
    @Column(length = 100) private String phone;

    // Order in which it is shown
    @Builder.Default
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
