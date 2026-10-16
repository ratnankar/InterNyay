package com.internyay.dto;

import com.internyay.entity.User;
import lombok.*;

import java.time.LocalDateTime;

// Associate of an advocate as shown in the team list
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class AssociateDto {

    public Long id;
    public String name;
    public String email;
    public String phone;
    public Boolean active;
    public LocalDateTime createdAt;
    public String upiId;
    // Payment QR code image of the associate
    public String qrImage;

    // Builds the DTO from the user, the QR image is fetched separately
    public static AssociateDto from(User u, String qrImage) {
        return AssociateDto.builder()
                .id(u.getId())
                .name(u.getName())
                .email(u.getEmail())
                .phone(u.getPhone())
                .active(u.getActive())
                .createdAt(u.getCreatedAt())
                .upiId(u.getUpiId())
                .qrImage(qrImage)
                .build();
    }
}
