package com.internyay.dto;

import com.internyay.entity.Client;
import lombok.*;

// Short client info used inside other DTOs
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ClientRefDto {

    public Long id;
    public String name;
    public String email;

    // Builds the DTO from the entity
    public static ClientRefDto from(Client c) {
        return ClientRefDto.builder()
                .id(c.getId())
                .name(c.getName())
                .email(c.getEmail())
                .build();
    }
}
