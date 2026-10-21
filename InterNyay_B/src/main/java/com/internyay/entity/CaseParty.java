package com.internyay.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

// Person details shared by the opposite parties of a case and by the non-client parties on our side
@MappedSuperclass
@Getter @Setter
public abstract class CaseParty {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    private String fatherName;

    @Column(length = 500)
    private String address;

    @Column(length = 30)
    private String phone;
}
