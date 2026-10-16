package com.internyay.dto;

import com.internyay.entity.LoginLog;
import lombok.*;

import java.time.LocalDateTime;

// One log row as sent to the admin page
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class LoginLogDto {

    public Long id;
    public Long userId;
    public String email;
    public String role;
    public String eventType;
    public String method;
    public String failureReason;
    public String ipAddress;
    public String userAgent;
    public LocalDateTime createdAt;

    // Builds the DTO from the entity
    public static LoginLogDto from(LoginLog l) {
        return LoginLogDto.builder()
                .id(l.getId())
                .userId(l.getUserId())
                .email(l.getEmail())
                .role(l.getRole())
                .eventType(l.getEventType() == null ? null : l.getEventType().name())
                .method(l.getMethod() == null ? null : l.getMethod().name())
                .failureReason(l.getFailureReason())
                .ipAddress(l.getIpAddress())
                .userAgent(l.getUserAgent())
                .createdAt(l.getCreatedAt())
                .build();
    }
}
