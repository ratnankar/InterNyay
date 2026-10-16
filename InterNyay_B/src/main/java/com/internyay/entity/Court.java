package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// One row of the court table: court complex, district, building and court no.
// District is empty for the High Court and Supreme Court, building and court no. are empty
// on the row that only registers a district. Empty strings (not null) keep the unique key reliable.
@Entity
@Table(name = "courts",
       uniqueConstraints = @UniqueConstraint(name = "uk_court_place",
               columnNames = {"court", "district", "building", "court_no"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Court {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Court complex, like Rohini or Saket
    @Column(nullable = false, length = 100)
    private String court;

    @Column(nullable = false, length = 100)
    private String district;

    @Column(name = "building", nullable = false, length = 50)
    private String building;

    @Column(name = "court_no", nullable = false, length = 50)
    private String courtNo;

    // True for courts above the district level (High Court, Supreme Court): they never have districts
    @Column(name = "high_court", nullable = false)
    private boolean highCourt;

    // True when this court room is a Mahila court. Orders are not declared for these courts, so none are fetched from eCourts
    @Column(name = "mahila_court", nullable = false, columnDefinition = "boolean default false")
    private boolean mahilaCourt;
}
