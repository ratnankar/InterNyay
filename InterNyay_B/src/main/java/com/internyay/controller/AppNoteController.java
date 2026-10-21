package com.internyay.controller;

import com.internyay.dto.AppNoteDto;
import com.internyay.dto.AppNoteRequest;
import com.internyay.dto.AppNoteSyncDto;
import com.internyay.service.AppNoteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// Private notes of the Calendar app. They belong to the signed-in account itself (an associate does not see the
// advocate's notes and the other way round)
@RestController
@RequestMapping("/api/notes")
@RequiredArgsConstructor
public class AppNoteController {

    private final AppNoteService service;
    private final AuthHelper auth;

    // Notes and deletions changed after "since" (epoch milliseconds; leave out for everything)
    @GetMapping
    public ResponseEntity<AppNoteSyncDto> list(@RequestParam(defaultValue = "0") long since) {
        return ResponseEntity.ok(new AppNoteSyncDto(service.changedSince(auth.currentAccountId(), since)));
    }

    // Create or update a note; the response is the note as stored (the stored one, when it is newer than this edit)
    @PutMapping("/{id}")
    public ResponseEntity<AppNoteDto> save(@PathVariable String id, @Valid @RequestBody AppNoteRequest req) {
        return ResponseEntity.ok(service.save(auth.currentAccountId(), id, req));
    }

    // Delete a note ("at" is the time of deletion in epoch milliseconds, now when left out)
    @DeleteMapping("/{id}")
    public ResponseEntity<AppNoteDto> delete(@PathVariable String id, @RequestParam(required = false) Long at) {
        return ResponseEntity.ok(service.delete(auth.currentAccountId(), id, at != null ? at : System.currentTimeMillis()));
    }
}
