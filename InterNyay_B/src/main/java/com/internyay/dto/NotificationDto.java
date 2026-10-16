package com.internyay.dto;

import com.internyay.entity.Notification;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;

// Notification as sent to the frontend, the PDF is downloaded separately
@Getter @Builder
public class NotificationDto {

    private Long id;
    private String source;
    private String title;
    private String message;
    private LocalDate date;
    private boolean hasPdf;
    private String fileName;
    // Important ones pop up until dismissed
    private boolean important;
    // When the notification was published, as an ISO time with its UTC offset (e.g. 2026-10-14T18:38:00+05:30)
    private OffsetDateTime createdAt;
    // When it was last edited, same format, null if never edited
    private OffsetDateTime updatedAt;

    // Builds the DTO from the entity
    public static NotificationDto from(Notification n) {
        return NotificationDto.builder()
                .id(n.getId())
                .source(n.getSource())
                .title(n.getTitle())
                .message(n.getMessage())
                .date(n.getDate())
                .hasPdf(n.hasPdf())
                .fileName(n.getFileName())
                .important(n.isMarkedImportant())
                .createdAt(withOffset(n.getCreatedAt()))
                .updatedAt(withOffset(n.getUpdatedAt()))
                .build();
    }

    // Stored times are in the server's zone; attaching that zone's offset lets the browser show the correct moment (in IST) wherever the server runs
    private static OffsetDateTime withOffset(LocalDateTime t) {
        return t == null ? null : t.atZone(ZoneId.systemDefault()).toOffsetDateTime();
    }
}
