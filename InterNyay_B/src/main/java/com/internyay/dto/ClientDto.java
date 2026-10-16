package com.internyay.dto;

import com.internyay.entity.Client;
import lombok.*;

import java.time.LocalDateTime;

// Client details sent to the frontend
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ClientDto {

    public Long id;
    public String name;
    public String email;
    public String whatsappPhone;
    public String additionalPhone;
    public String address;
    public String profilePicture;
    public String type;
    public String customLabel;
    public LocalDateTime createdAt;

    // Builds the DTO from the entity, enums are sent as their display text
    public static ClientDto from(Client c) {
        return ClientDto.builder()
                .id(c.getId())
                .name(c.getName())
                .email(c.getEmail())
                .whatsappPhone(c.getWhatsapp_phone())
                .additionalPhone(c.getAdditional_phone())
                .address(c.getAddress())
                .profilePicture(c.getProfilePicture())
                .type(c.getType() != null ? c.getType().getValue() : null)
                .customLabel(c.getCustomLabel() != null ? c.getCustomLabel().getValue() : null)
                .createdAt(c.getCreatedAt())
                .build();
    }
}
