package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// Link saying a police station falls under a consumer commission
@Entity
@Table(name = "consumer_stations")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ConsumerStation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // The commission
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "commission_id", nullable = false)
    private ConsumerCommission commission;

    // The police station it covers
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "police_station_id", nullable = false)
    private PoliceStation policeStation;

    // Order in which it is shown
    @Builder.Default
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
