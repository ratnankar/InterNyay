package com.internyay.controller;

import com.internyay.dto.ContactMessageDto;
import com.internyay.dto.ContactReplyRequest;
import com.internyay.dto.ContactStatusRequest;
import com.internyay.service.ContactService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Admin inbox for messages sent through the Contact Us forms
@RestController
@RequestMapping("/api/admin/contact-messages")
@RequiredArgsConstructor
public class AdminContactController {

    private final ContactService contactService;
    private final AuthHelper auth;

    // List messages, optionally filtered by status
    @GetMapping
    public List<ContactMessageDto> list(@RequestParam(required = false) String status) {
        return contactService.list(status);
    }

    // Open any attached file
    @GetMapping("/attachments/{id}")
    public ResponseEntity<InputStreamResource> attachment(@PathVariable Long id) {
        return ContactController.serve(contactService.openAttachment(id, null));
    }

    // Change a message's status (new / read / resolved)
    @PutMapping("/{id}/status")
    public ContactMessageDto setStatus(@PathVariable Long id, @Valid @RequestBody ContactStatusRequest body) {
        return contactService.setStatus(id, body.status);
    }

    // Save an admin reply, it is emailed and/or shown to the sender
    @PostMapping("/{id}/replies")
    public ContactMessageDto reply(@PathVariable Long id, @Valid @RequestBody ContactReplyRequest body) {
        return contactService.reply(id, auth.currentAccount().getName(), body.body, body.channel);
    }

    // Remove a message and its replies
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        contactService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
