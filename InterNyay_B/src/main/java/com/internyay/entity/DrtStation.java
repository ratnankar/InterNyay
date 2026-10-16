package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// Link saying a police station falls under a DRT tribunal
@Entity
@Table(name = "drt_stations")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DrtStation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // The tribunal
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tribunal_id", nullable = false)
    private DrtTribunal tribunal;

    // The police station it covers
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "police_station_id", nullable = false)
    private PoliceStation policeStation;

    // Order in which it is shown
    @Builder.Default
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
