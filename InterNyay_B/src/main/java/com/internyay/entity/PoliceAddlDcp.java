package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// Additional DCP of a police district
@Entity
@Table(name = "police_addl_dcps")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PoliceAddlDcp {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // District the officer belongs to
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "district_id", nullable = false)
    private PoliceDistrict district;

    // Post and contact details
    @Column(length = 200) private String post;
    @Column(length = 500) private String address;
    @Column(length = 200) private String email;
    @Column(length = 100) private String phone;

    // Order in which it is shown
    @Builder.Default
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
