package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

// Small key and value settings for the police directory
@Entity
@Table(name = "police_directory_settings")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class PoliceSetting {

    @Id
    @Column(name = "setting_key", length = 64)
    private String key;

    @Column(name = "setting_value", columnDefinition = "TEXT")
    private String value;
}
