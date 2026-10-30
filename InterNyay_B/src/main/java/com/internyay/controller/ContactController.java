package com.internyay.controller;

import com.internyay.dto.ContactMessageDto;
import com.internyay.dto.ContactRequest;
import com.internyay.entity.User;
import com.internyay.service.ContactService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

// Contact Us for logged in users
@RestController
@RequestMapping("/api/contact")
@RequiredArgsConstructor
public class ContactController {

    private final ContactService contactService;
    private final AuthHelper auth;

    // Send a message to the admin
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ContactMessageDto> send(@Valid @RequestBody ContactRequest request) {
        User account = auth.currentAccount();
        return ResponseEntity.status(HttpStatus.CREATED).body(contactService.submit(account, request));
    }

    // Send a message with photos, videos or PDFs attached: the message as the "data" part, the files as "files"
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ContactMessageDto> sendWithFiles(
            @Valid @RequestPart("data") ContactRequest request,
            @RequestPart(value = "files", required = false) List<MultipartFile> files) {
        User account = auth.currentAccount();
        return ResponseEntity.status(HttpStatus.CREATED).body(contactService.submit(account, request, files));
    }

    // Open a file attached to one of the user's own messages
    @GetMapping("/attachments/{id}")
    public ResponseEntity<InputStreamResource> attachment(@PathVariable Long id) {
        return serve(contactService.openAttachment(id, auth.currentAccountId()));
    }

    // Streams an attachment with a safe content type, shown inline for photos, videos and PDFs
    static ResponseEntity<InputStreamResource> serve(ContactService.AttachmentFile f) {
        String encoded = URLEncoder.encode(f.fileName(), StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename*=UTF-8''" + encoded)
                .header(HttpHeaders.CONTENT_TYPE, f.mimeType())
                .header("X-Content-Type-Options", "nosniff")
                .contentLength(f.sizeBytes())
                .body(new InputStreamResource(f.data()));
    }

    // The user's own messages with admin replies
    @GetMapping("/mine")
    public List<ContactMessageDto> mine() {
        return contactService.mine(auth.currentAccountId());
    }

    // Number of admin replies the user hasn't opened yet
    @GetMapping("/unread-replies")
    public Map<String, Long> unreadReplies() {
        return Map.of("count", contactService.unreadReplies(auth.currentAccountId()));
    }

    // Mark a reply as read
    @PostMapping("/{id}/seen")
    public ResponseEntity<Void> seen(@PathVariable Long id) {
        contactService.markSeen(auth.currentAccountId(), id);
        return ResponseEntity.noContent().build();
    }
}
