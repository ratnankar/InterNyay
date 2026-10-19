package com.internyay.service;

import com.internyay.dto.DocumentDto;
import com.internyay.entity.Case;
import com.internyay.entity.Client;
import com.internyay.entity.DocumentMeta;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.ClientRepository;
import com.internyay.repository.DocumentRepository;
import com.internyay.repository.MiscApplicationRepository;
import com.internyay.storage.FileStorage;
import com.internyay.storage.StorageCleaner;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

// Document details live in MySQL, the files themselves in file storage (disk or S3 bucket)
@Service
@RequiredArgsConstructor
public class DocumentService {

    private final DocumentRepository docRepo;
    private final FileStorage storage;
    private final StorageCleaner cleaner;
    private final CaseRepository caseRepo;
    private final ClientRepository clientRepo;
    private final MiscApplicationRepository miscRepo;

    // Documents of a case, newest first. Only for the owner of the case: someone else's case answers
    // "not found" (404), the same as a case that does not exist, so ids cannot be probed one by one
    public List<DocumentDto> listForCase(Long caseId, Long userId) {
        Case legalCase = caseRepo.findById(caseId)
                .orElseThrow(() -> new NoSuchElementException("Case not found"));
        if (legalCase.getUser() == null || !legalCase.getUser().getId().equals(userId)) {
            throw new NoSuchElementException("Case not found");
        }
        return listForOwnedCase(caseId);
    }

    // Fills in the application's name on the documents of misc. applications (one query for the whole list)
    private List<DocumentDto> withMiscNames(List<DocumentDto> docs) {
        Set<Long> ids = docs.stream().map(d -> d.miscApplicationId).filter(Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) return docs;

        Map<Long, String> names = new HashMap<>();
        miscRepo.findAllById(ids).forEach(a -> names.put(a.getId(), a.getApplicationType()));
        docs.forEach(d -> { if (d.miscApplicationId != null) d.miscApplicationName = names.get(d.miscApplicationId); });
        return docs;
    }

    // Documents of a client, only for the owner of the client (404 otherwise, as for cases)
    public List<DocumentDto> listForClient(Long clientId, Long userId) {
        Client client = clientRepo.findById(clientId)
                .orElseThrow(() -> new NoSuchElementException("Client not found"));
        if (client.getUser() == null || !client.getUser().getId().equals(userId)) {
            throw new NoSuchElementException("Client not found");
        }
        return listForOwnedClient(clientId);
    }

    // Documents of a case that the caller has ALREADY loaded and checked for this user (CaseService, chat tools).
    // Never call this with an id that came straight from a request: use listForCase(caseId, userId)
    public List<DocumentDto> listForOwnedCase(Long caseId) {
        return withMiscNames(docRepo.findByCaseIdOrderByUploadedAtDesc(caseId)
                .stream().map(DocumentDto::from).collect(Collectors.toList()));
    }

    // Same for a client that has already been checked for this user
    public List<DocumentDto> listForOwnedClient(Long clientId) {
        return docRepo.findByClientIdOrderByUploadedAtDesc(clientId)
                .stream().map(DocumentDto::from).collect(Collectors.toList());
    }

    // Documents of one misc. application that the caller has ALREADY checked for this user, oldest first
    public List<DocumentDto> listForOwnedMiscApplication(Long miscApplicationId) {
        return docRepo.findByMiscApplicationIdOrderByUploadedAtAsc(miscApplicationId)
                .stream().map(DocumentDto::from).collect(Collectors.toList());
    }

    // Documents for many misc. applications at once (already checked for this user)
    public Map<Long, List<DocumentDto>> mapByMiscApplicationIds(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        return docRepo.findByMiscApplicationIdIn(ids).stream()
                .sorted(Comparator.comparing(DocumentMeta::getUploadedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .map(DocumentDto::from)
                .collect(Collectors.groupingBy(d -> d.miscApplicationId, LinkedHashMap::new, Collectors.toList()));
    }

    // Everything the user has uploaded
    public List<DocumentDto> listForUser(Long userId) {
        return withMiscNames(docRepo.findByUserIdOrderByUploadedAtDesc(userId)
                .stream().map(DocumentDto::from).collect(Collectors.toList()));
    }

    // Only advocate level documents (no case, no client)
    public List<DocumentDto> listForAdvocate(Long userId) {
        return docRepo.findByUserIdAndCaseIdIsNullAndClientIdIsNullOrderByUploadedAtDesc(userId)
                .stream().map(DocumentDto::from).collect(Collectors.toList());
    }

    // Documents for many cases at once
    public Map<Long, List<DocumentDto>> mapByCaseIds(Collection<Long> caseIds) {
        if (caseIds == null || caseIds.isEmpty()) return Map.of();
        // The application's name is filled in too, so a case's misc. documents are grouped under it (not under "Misc. Application")
        List<DocumentDto> all = withMiscNames(docRepo.findByCaseIdIn(caseIds).stream()
                .map(DocumentDto::from)
                .collect(Collectors.toList()));
        return all.stream().collect(Collectors.groupingBy(d -> d.caseId));
    }

    // Attach a document to a case
    public DocumentDto uploadForCase(Long caseId, MultipartFile file,
                                     String name, String type, Long userId) throws IOException {

        Case legalCase = caseRepo.findById(caseId)
                .orElseThrow(() -> new NoSuchElementException("Case not found"));

        if (!legalCase.getUser().getId().equals(userId)) {
            throw new SecurityException("Forbidden");
        }

        return store(file, name, type, caseId, null, userId);
    }

    // Attach a document to a client
    public DocumentDto uploadForClient(Long clientId, MultipartFile file,
                                       String name, String type, Long userId) throws IOException {

        Client client = clientRepo.findById(clientId)
                .orElseThrow(() -> new NoSuchElementException("Client not found"));

        if (!client.getUser().getId().equals(userId)) {
            throw new SecurityException("Forbidden");
        }

        return store(file, name, type, null, clientId, userId);
    }

    // Evidence can't be advocate level, it has to be tied to a case or client
    public DocumentDto uploadForAdvocate(MultipartFile file, String name, String type, Long userId)
            throws IOException {

        if (type != null && type.startsWith("Evidence - ")) {
            throw new IllegalArgumentException("Evidence must be attached to a case or client");
        }

        return store(file, name, type, null, null, userId);
    }

    // Writes the file to file storage and saves its details in MySQL
    public DocumentDto store(MultipartFile file, String name, String type,
                             Long caseId, Long clientId, Long userId) throws IOException {
        return store(file, name, type, caseId, clientId, null, null, userId);
    }

    // Same, for a document of a misc. application (it also belongs to the application's case)
    public DocumentDto storeForMiscApplication(MultipartFile file, String name, String type,
                                               Long caseId, Long miscApplicationId, String miscRole,
                                               Long userId) throws IOException {
        return store(file, name, type, caseId, null, miscApplicationId, miscRole, userId);
    }

    // Writes the file to file storage and saves its details in MySQL
    private DocumentDto store(MultipartFile file, String name, String type,
                              Long caseId, Long clientId,
                              Long miscApplicationId, String miscRole, Long userId) throws IOException {

        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File is empty");
        }

        String original = (file.getOriginalFilename() != null && !file.getOriginalFilename().isBlank())
                ? cut(file.getOriginalFilename(), 512)
                : "document";

        // The file goes first, so no database connection is held while a large file uploads
        String key = FileStorage.newKey("documents");
        try (InputStream in = file.getInputStream()) {
            storage.put(key, in, file.getSize(), file.getContentType());
        }

        // When this runs inside a bigger transaction (hearing order upload) and it rolls back, the file goes too
        cleaner.deleteOnRollback(key);

        DocumentMeta meta = DocumentMeta.builder()
                .name(cut((name == null || name.isBlank()) ? original : name, 512))
                .type(cut((type == null || type.isBlank()) ? "Other" : type, 255))
                .fileName(original)
                .mimeType(cut(file.getContentType(), 255))
                .sizeBytes(file.getSize())
                .storageKey(key)
                .caseId(caseId)
                .clientId(clientId)
                .miscApplicationId(miscApplicationId)
                .miscRole(miscRole)
                .userId(userId)
                .uploadedAt(LocalDateTime.now())
                .build();

        try {
            return DocumentDto.from(docRepo.save(meta));
        } catch (RuntimeException e) {
            storage.delete(key);
            throw e;
        }
    }

    // Same as store, for a file that was downloaded (like an order fetched from eCourts) instead of uploaded
    public DocumentDto storeBytes(byte[] content, String fileName, String mimeType, String name, String type,
                                  Long caseId, Long clientId, Long userId) {

        if (content == null || content.length == 0) {
            throw new IllegalArgumentException("File is empty");
        }

        String original = (fileName != null && !fileName.isBlank()) ? cut(fileName, 512) : "document";

        String key = FileStorage.newKey("documents");
        storage.put(key, new java.io.ByteArrayInputStream(content), content.length, mimeType);

        // When this runs inside a bigger transaction and it rolls back, the file goes too
        cleaner.deleteOnRollback(key);

        DocumentMeta meta = DocumentMeta.builder()
                .name(cut((name == null || name.isBlank()) ? original : name, 512))
                .type(cut((type == null || type.isBlank()) ? "Other" : type, 255))
                .fileName(original)
                .mimeType(cut(mimeType, 255))
                .sizeBytes(content.length)
                .storageKey(key)
                .caseId(caseId)
                .clientId(clientId)
                .userId(userId)
                .uploadedAt(LocalDateTime.now())
                .build();

        try {
            return DocumentDto.from(docRepo.save(meta));
        } catch (RuntimeException e) {
            storage.delete(key);
            throw e;
        }
    }

    // Sets the order number and the hearing date on a hearing order document
    public void setOrderSeq(String id, Integer orderSeq, java.time.LocalDate orderDate) {
        DocumentMeta meta = getMeta(id);
        meta.setOrderSeq(orderSeq);
        meta.setOrderDate(orderDate);
        docRepo.save(meta);
    }

    // Metadata by id or 404
    public DocumentMeta getMeta(String id) {
        return docRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Document not found"));
    }

    // File content, only for the owner. The caller closes the stream
    public InputStream getBinary(String id, Long userId) {

        DocumentMeta meta = getMeta(id);
        checkOwner(meta, userId);

        return storage.open(meta.getStorageKey());
    }

    // Renames a document (the name shown in the lists), only for the owner. The stored file and the original
    // file name of the upload are not touched
    public DocumentDto rename(String id, String name, Long userId) {

        DocumentMeta meta = getMeta(id);
        checkOwner(meta, userId);

        String clean = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        if (clean.isEmpty()) {
            throw new IllegalArgumentException("Document name is required");
        }

        meta.setName(cut(clean, 512));
        return DocumentDto.from(docRepo.save(meta));
    }

    // Delete one document, only for the owner
    public void delete(String id, Long userId) {

        DocumentMeta meta = getMeta(id);
        checkOwner(meta, userId);

        docRepo.delete(meta);
        cleaner.deleteAfterCommit(Collections.singletonList(meta.getStorageKey()));
    }

    // Remove all documents of a case
    @org.springframework.transaction.annotation.Transactional
    public void deleteAllForCase(Long caseId) {
        remove(docRepo.findByCaseIdOrderByUploadedAtDesc(caseId));
    }

    // The application's own file is filed under the application's type, so renaming the type renames it there too
    @org.springframework.transaction.annotation.Transactional
    public void retypeMiscDocuments(Long miscApplicationId, String miscRole, String type) {
        for (DocumentMeta d : docRepo.findByMiscApplicationIdOrderByUploadedAtAsc(miscApplicationId)) {
            if (miscRole.equals(d.getMiscRole()) && !type.equals(d.getType())) {
                d.setType(type);
                docRepo.save(d);
            }
        }
    }

    // Remove all documents of a misc. application
    @org.springframework.transaction.annotation.Transactional
    public void deleteAllForMiscApplication(Long miscApplicationId) {
        remove(docRepo.findByMiscApplicationIdOrderByUploadedAtAsc(miscApplicationId));
    }

    // Remove all documents of a client
    @org.springframework.transaction.annotation.Transactional
    public void deleteAllForClient(Long clientId) {
        remove(docRepo.findByClientIdOrderByUploadedAtDesc(clientId));
    }

    // Remove all documents of a user
    @org.springframework.transaction.annotation.Transactional
    public void deleteAllForUser(Long userId) {
        remove(docRepo.findByUserIdOrderByUploadedAtDesc(userId));
    }

    // Rows go now, the files after the transaction commits
    private void remove(List<DocumentMeta> docs) {
        if (docs.isEmpty()) return;
        docRepo.deleteAll(docs);
        cleaner.deleteAfterCommit(docs.stream().map(DocumentMeta::getStorageKey).toList());
    }

    private void checkOwner(DocumentMeta meta, Long userId) {
        if (userId != null && meta.getUserId() != null && !meta.getUserId().equals(userId)) {
            throw new SecurityException("Forbidden");
        }
    }

    // Shortens text so it fits its column
    private static String cut(String text, int max) {
        if (text == null) return null;
        return text.length() <= max ? text : text.substring(0, max);
    }
}
