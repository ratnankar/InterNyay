package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// A police station under a sub division
@Entity
@Table(name = "police_stations")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PoliceStation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Sub division the station belongs to
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sub_division_id", nullable = false)
    private PoliceSubDivision subDivision;

    @Column(nullable = false, length = 150)
    private String name;

    // Contact details
    @Column(length = 100) private String phone;
    @Column(length = 200) private String email;
    @Column(length = 500) private String address;
    @Column(length = 10)  private String pin;

    // Order in which it is shown
    @Builder.Default
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
