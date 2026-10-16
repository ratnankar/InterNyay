package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// A police district with its headquarters and senior officers
@Entity
@Table(name = "police_districts")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PoliceDistrict {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    // Police range the district falls under
    @Column(name = "police_range", length = 100)
    private String policeRange;

    // Court complex the district reports to
    @Column(length = 100)
    private String court;

    // Default type used when adding a station
    @Column(name = "default_type", length = 50)
    private String defaultType;

    // Address of the headquarters
    @Column(length = 500)
    private String hq;

    // DCP details
    @Column(name = "dcp_post",    length = 200) private String dcpPost;
    @Column(name = "dcp_address", length = 500) private String dcpAddress;
    @Column(name = "dcp_email",   length = 200) private String dcpEmail;
    @Column(name = "dcp_phone",   length = 100) private String dcpPhone;

    // CAW cell details
    @Column(name = "caw_post",    length = 200) private String cawPost;
    @Column(name = "caw_address", length = 500) private String cawAddress;
    @Column(name = "caw_email",   length = 200) private String cawEmail;
    @Column(name = "caw_phone",   length = 100) private String cawPhone;

    // Order in which it is shown
    @Builder.Default
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
