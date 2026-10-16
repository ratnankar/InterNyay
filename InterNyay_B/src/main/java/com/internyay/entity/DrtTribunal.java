package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// A Debt Recovery Tribunal in the DRT jurisdiction directory
@Entity
@Table(name = "drt_tribunals")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DrtTribunal {

    // Kinds of tribunal
    public static final String BENCH = "BENCH";
    public static final String HIGH_VALUE = "HIGH_VALUE";
    public static final String APPELLATE = "APPELLATE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String kind;

    @Column(nullable = false, length = 300)
    private String name;

    @Column(length = 500)
    private String location;

    @Column(length = 100)
    private String phone;

    // Districts it covers, as shown to the user
    @Column(name = "districts_label", length = 500)
    private String districtsLabel;

    // Claim amount range it handles
    @Column(name = "amount_label", length = 200)
    private String amountLabel;

    // Full jurisdiction details
    @Column(name = "jurisdiction_text", columnDefinition = "TEXT")
    private String jurisdictionText;

    @Column(columnDefinition = "TEXT")
    private String note;

    // Order in which it is shown
    @Builder.Default
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
