package com.internyay.dto;

import com.internyay.entity.DocumentMeta;
import lombok.*;

// Document details sent to the frontend
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocumentDto {

    public String id;
    public Long caseId;
    public Long clientId;
    public Long userId;
    // Misc. application the document belongs to and its role there (APPLICATION, ORDER, ADDITIONAL), null otherwise
    public Long miscApplicationId;
    public String miscRole;
    public String name;
    public String type;
    public String fileName;
    // Readable size like 1.2 MB
    public String size;
    public long sizeBytes;
    public String mimeType;
    // Upload date as yyyy-MM-dd
    public String date;

    public Integer orderSeq;

    // Hearing date of an order document as yyyy-MM-dd
    public String orderDate;

    // Builds the DTO from the database record
    public static DocumentDto from(DocumentMeta d) {
        return DocumentDto.builder()
                .id(d.getId())
                .caseId(d.getCaseId())
                .clientId(d.getClientId())
                .userId(d.getUserId())
                .miscApplicationId(d.getMiscApplicationId())
                .miscRole(d.getMiscRole())
                .name(d.getName())
                .type(d.getType())
                .fileName(d.getFileName())
                .size(formatSize(d.getSizeBytes()))
                .sizeBytes(d.getSizeBytes())
                .mimeType(d.getMimeType())
                .orderSeq(d.getOrderSeq())
                .orderDate(d.getOrderDate() != null ? d.getOrderDate().toString() : null)
                .date(d.getUploadedAt() != null
                        ? d.getUploadedAt().toLocalDate().toString()
                        : null)
                .build();
    }

    // Turns bytes into B, KB or MB
    public static String formatSize(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        return String.format("%.1f MB", bytes / (1024.0 * 1024));
    }
}
