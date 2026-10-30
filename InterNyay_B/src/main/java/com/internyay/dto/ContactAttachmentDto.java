package com.internyay.dto;

import com.internyay.entity.ContactAttachment;
import lombok.*;

// Attachment details shown with a contact message (the file itself is downloaded separately)
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class ContactAttachmentDto {

    public Long id;
    public String fileName;
    public String mimeType;
    public Long sizeBytes;

    // Builds the DTO from the entity
    public static ContactAttachmentDto from(ContactAttachment a) {
        return ContactAttachmentDto.builder()
                .id(a.getId())
                .fileName(a.getFileName())
                .mimeType(a.getMimeType())
                .sizeBytes(a.getSizeBytes())
                .build();
    }
}
