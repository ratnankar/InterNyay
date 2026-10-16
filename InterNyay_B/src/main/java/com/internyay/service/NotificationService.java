package com.internyay.service;

import com.internyay.entity.Notification;
import com.internyay.entity.NotificationDismissal;
import com.internyay.entity.User;
import com.internyay.repository.NotificationDismissalRepository;
import com.internyay.repository.NotificationRepository;
import com.internyay.storage.FileStorage;
import com.internyay.storage.StorageCleaner;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.NoSuchElementException;

// Notifications & Circulations: details in MySQL, the attached PDF in file storage
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepo;
    private final NotificationDismissalRepository dismissalRepo;
    private final FileStorage storage;
    private final StorageCleaner cleaner;

    // Newest first
    public List<Notification> listAll() {
        return notificationRepo.findAllByOrderByDateDescIdDesc();
    }

    // Newest first for one source (court / bar association)
    public List<Notification> listBySource(String source) {
        return notificationRepo.findBySourceOrderByDateDescIdDesc(source);
    }

    // Count, highest id and latest update time as a string, changes whenever any notification changes
    public String changeStamp() {
        NotificationRepository.ChangeStamp s = notificationRepo.changeStamp();
        return s.getCnt() + "-" + (s.getMaxId() == null ? 0 : s.getMaxId())
                + "-" + (s.getMaxUpdated() == null ? "" : s.getMaxUpdated().toString());
    }

    // Important notifications posted since the account was created and not yet dismissed
    public List<Notification> listPendingImportant(User account) {
        LocalDateTime since = account.getCreatedAt() != null
                ? account.getCreatedAt()
                : LocalDateTime.of(2000, 1, 1, 0, 0);
        return notificationRepo.findPendingImportant(account.getId(), since);
    }

    // Notification by id or 404
    public Notification get(Long id) {
        return notificationRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Notification not found"));
    }

    // Attached PDF, 404 when none. The caller closes the stream
    public InputStream getBinary(Notification n) {
        if (!n.hasPdf()) {
            throw new NoSuchElementException("This notification has no attached PDF");
        }
        return storage.open(n.getStorageKey());
    }

    // Admin publishes a notification with an optional PDF
    public Notification push(String source, String title, String message,
                              LocalDate date, MultipartFile file, boolean important) throws IOException {

        Notification n = new Notification();
        n.setSource(source);
        n.setTitle(title);
        n.setMessage(message);
        n.setDate(date != null ? date : LocalDate.now());
        n.setImportant(important);

        attachFileIfPresent(n, file);

        try {
            return notificationRepo.save(n);
        } catch (RuntimeException e) {
            // The row was not saved, so the uploaded PDF would be left behind
            if (n.getStorageKey() != null) storage.delete(n.getStorageKey());
            throw e;
        }
    }

    // Edit fields, replace the PDF or remove it
    public Notification update(Long id, String source, String title, String message,
                                LocalDate date, MultipartFile file, boolean removeFile,
                                Boolean important) throws IOException {

        Notification n = get(id);

        if (source != null && !source.isBlank()) n.setSource(source);
        if (title  != null && !title.isBlank())  n.setTitle(title);
        n.setMessage(message);
        if (date != null) n.setDate(date);
        if (important != null) n.setImportant(important);

        String oldKey = null;
        String newKey = null;

        if (file != null && !file.isEmpty()) {
            oldKey = n.getStorageKey();
            clearFile(n);
            attachFileIfPresent(n, file);
            newKey = n.getStorageKey();
        } else if (removeFile) {
            oldKey = n.getStorageKey();
            clearFile(n);
        }

        n.setUpdatedAt(LocalDateTime.now());

        Notification saved;
        try {
            saved = notificationRepo.save(n);
        } catch (RuntimeException e) {
            if (newKey != null) storage.delete(newKey);
            throw e;
        }

        // The old PDF is removed only after the new state is saved
        if (oldKey != null) storage.delete(oldKey);
        return saved;
    }

    // Deletes the notification, its PDF and everyone's dismissals
    @Transactional
    public void delete(Long id) {
        Notification n = get(id);
        dismissalRepo.deleteByNotificationId(id);
        notificationRepo.delete(n);
        cleaner.deleteAfterCommit(Collections.singletonList(n.getStorageKey()));
    }

    // Per user dismissal, doing it twice is fine
    public void dismiss(Long accountId, Long notificationId) {
        get(notificationId);
        if (dismissalRepo.existsByUserIdAndNotificationId(accountId, notificationId)) return;
        try {
            dismissalRepo.save(new NotificationDismissal(accountId, notificationId));
        } catch (DataIntegrityViolationException alreadyDismissed) {
        }
    }

    // Stores the PDF in file storage and keeps its name, type and size
    private void attachFileIfPresent(Notification n, MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) return;

        String original = file.getOriginalFilename() != null ? file.getOriginalFilename() : "notification.pdf";
        String mimeType  = file.getContentType() != null ? file.getContentType() : MediaType.APPLICATION_PDF_VALUE;

        String key = FileStorage.newKey("notifications");
        try (InputStream in = file.getInputStream()) {
            storage.put(key, in, file.getSize(), mimeType);
        }

        n.setFileName(original);
        n.setMimeType(mimeType);
        n.setSizeBytes(file.getSize());
        n.setStorageKey(key);
    }

    // Forgets the attached PDF on the record (the file itself is deleted by the caller)
    private void clearFile(Notification n) {
        n.setStorageKey(null);
        n.setFileName(null);
        n.setMimeType(null);
        n.setSizeBytes(0);
    }
}
