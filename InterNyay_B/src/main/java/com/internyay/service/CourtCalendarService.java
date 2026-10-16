package com.internyay.service;

import com.internyay.entity.CourtCalendar;
import com.internyay.repository.CourtCalendarRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

// Stores the yearly court calendar PDF: details in MySQL, the file in file storage
@Service
@RequiredArgsConstructor
public class CourtCalendarService {

    private final CourtCalendarRepository repository;
    private final StoredPdfFiles files;

    public CourtCalendar uploadCalendar(
            Integer year,
            MultipartFile file) throws IOException {

        if (file.isEmpty()) {
            throw new RuntimeException("Calendar PDF is empty");
        }

        if (!"application/pdf".equalsIgnoreCase(file.getContentType())) {
            throw new RuntimeException("Only PDF files are allowed");
        }

        CourtCalendar calendar = repository
                .findByYear(year)
                .orElse(new CourtCalendar());

        String oldKey = calendar.getStorageKey();
        String newKey = files.save("court-calendars", file);

        calendar.setYear(year);
        calendar.setFileName(file.getOriginalFilename());
        calendar.setStorageKey(newKey);

        CourtCalendar saved;
        try {
            saved = repository.save(calendar);
        } catch (RuntimeException e) {
            // The row was not saved, so the new file would be left behind
            files.delete(newKey);
            throw e;
        }

        // The old PDF is removed only after the new one is saved
        files.delete(oldKey);
        return saved;
    }

    // Calendar for a year or an error if none was uploaded
    public CourtCalendar getCalendar(Integer year) {

        return repository.findByYear(year)
                .orElseThrow(() ->
                        new RuntimeException(
                                "Court calendar not found for year: " + year
                        )
                );
    }

    // The PDF of a calendar as a stream
    public java.io.InputStream openPdf(CourtCalendar calendar) {
        return files.open(calendar.getStorageKey());
    }

    // All years, newest first
    public java.util.List<CourtCalendar> listAll() {
        return repository.findAllByOrderByYearDesc();
    }

    // Remove a year's calendar and its file
    public void deleteCalendar(Integer year) {
        CourtCalendar calendar = getCalendar(year);
        repository.delete(calendar);
        files.delete(calendar.getStorageKey());
    }
}
