package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// Yearly court calendar PDF uploaded by the admin
@Entity
@Table(name = "court_calendars")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CourtCalendar {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // One calendar per year
    @Column(nullable = false, unique = true)
    private Integer year;

    @Column(nullable = false)
    private String fileName;

    // Where the PDF is kept in file storage (disk or S3 bucket)
    @Column(name = "storage_key", nullable = false, length = 255)
    private String storageKey;
}
