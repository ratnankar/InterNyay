package com.internyay.dto;

import com.internyay.entity.ContactMessage;
import com.internyay.entity.ContactReply;
import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

// Contact message with its replies
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class ContactMessageDto {

    public Long id;
    public Long accountId;
    public String role;
    public String name;
    public String email;
    public String phone;
    public String category;
    public String subject;
    public String message;
    public String status;
    public LocalDateTime createdAt;

    public List<ContactReplyDto> replies;

    // True when there is an admin reply the user has not read
    public Boolean unreadReply;

    // Builds the DTO from the message and its replies
    public static ContactMessageDto from(ContactMessage m, List<ContactReply> replies) {
        return ContactMessageDto.builder()
                .id(m.getId())
                .accountId(m.getAccountId())
                .role(m.getRole())
                .name(m.getName())
                .email(m.getEmail())
                .phone(m.getPhone())
                .category(m.getCategory())
                .subject(m.getSubject())
                .message(m.getMessage())
                .status(m.getStatus())
                .createdAt(m.getCreatedAt())
                .replies(replies.stream().map(ContactReplyDto::from).toList())
                .unreadReply(Boolean.TRUE.equals(m.getUserUnread()))
                .build();
    }
}
