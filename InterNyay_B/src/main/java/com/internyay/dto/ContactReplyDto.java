package com.internyay.dto;

import com.internyay.entity.ContactReply;
import lombok.*;

import java.time.LocalDateTime;

// Admin reply as sent to the frontend
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class ContactReplyDto {

    public Long id;
    public String adminName;
    public String body;

    public String channel;

    public Boolean emailed;

    public LocalDateTime createdAt;

    // Builds the DTO from the entity
    public static ContactReplyDto from(ContactReply r) {
        return ContactReplyDto.builder()
                .id(r.getId())
                .adminName(r.getAdminName())
                .body(r.getBody())
                .channel(r.getChannel())
                .emailed(r.getEmailed())
                .createdAt(r.getCreatedAt())
                .build();
    }
}
