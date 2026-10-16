package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// A consumer commission (district, state or national) in the consumer jurisdiction directory
@Entity
@Table(name = "consumer_commissions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ConsumerCommission {

    // Kinds of commission
    public static final String DISTRICT = "DISTRICT";
    public static final String STATE = "STATE";
    public static final String NATIONAL = "NATIONAL";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String kind;

    @Column(nullable = false, length = 300)
    private String name;

    // Address of the commission
    @Column(length = 500)
    private String location;

    // Order in which it is shown
    @Builder.Default
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
