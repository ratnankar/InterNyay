package com.internyay.controller;

import com.internyay.dto.ContactMessageDto;
import com.internyay.dto.ContactRequest;
import com.internyay.entity.User;
import com.internyay.service.ContactService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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
    @PostMapping
    public ResponseEntity<ContactMessageDto> send(@Valid @RequestBody ContactRequest request) {
        User account = auth.currentAccount();
        return ResponseEntity.status(HttpStatus.CREATED).body(contactService.submit(account, request));
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
