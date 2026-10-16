package com.internyay.controller;

import com.internyay.dto.*;
import com.internyay.service.ClientService;
import com.internyay.service.DocumentService;
import jakarta.validation.Valid;
import jakarta.validation.groups.Default;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

// Clients of the logged in advocate
@RestController
@RequestMapping("/api/clients")
@RequiredArgsConstructor
public class ClientController {

    private final ClientService clientService;
    private final DocumentService documentService;
    private final AuthHelper auth;

    // Paged, searchable client list
    @GetMapping
    public ResponseEntity<Page<ClientDto>> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(clientService.list(auth.currentUserId(), search, type, page, size));
    }

    // Create a client, the Create group adds the checks needed only for new clients
    @PostMapping
    public ResponseEntity<ClientDto> create(@Validated({Default.class, ClientRequest.Create.class}) @RequestBody ClientRequest req) {
        return ResponseEntity.ok(clientService.create(req, auth.currentUserId()));
    }

    // Update a client
    @PutMapping("/{id}")
    public ResponseEntity<ClientDto> update(@PathVariable Long id, @Valid @RequestBody ClientRequest req) {
        return ResponseEntity.ok(clientService.update(id, req, auth.currentUserId()));
    }

    // Delete a client
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        clientService.delete(id, auth.currentUserId());
        return ResponseEntity.noContent().build();
    }

    // Upload a document to a client
    @PostMapping(value = "/{id}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DocumentDto> uploadDoc(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String type) throws IOException {

        return ResponseEntity.ok(
                documentService.uploadForClient(id, file, name, type, auth.currentUserId()));
    }
}
