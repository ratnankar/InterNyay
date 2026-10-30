package com.internyay.service;

import com.internyay.dto.ContactMessageDto;
import com.internyay.dto.ContactPublicRequest;
import com.internyay.dto.ContactRequest;
import com.internyay.entity.ContactAttachment;
import com.internyay.entity.ContactMessage;
import com.internyay.entity.ContactReply;
import com.internyay.entity.User;
import com.internyay.repository.ContactAttachmentRepository;
import com.internyay.repository.ContactMessageRepository;
import com.internyay.repository.ContactReplyRepository;
import com.internyay.repository.UserRepository;
import com.internyay.storage.FileStorage;
import com.internyay.storage.StorageCleaner;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Locale;
import java.util.Set;

// Contact Us messages and admin replies
@Service
@RequiredArgsConstructor
@Slf4j
public class ContactService {

    private static final Set<String> STATUSES = Set.of(
            ContactMessage.NEW, ContactMessage.READ, ContactMessage.RESOLVED);

    // Contact Us topics come from the admin-managed option list (CONTACT_CATEGORY)
    private final OptionService options;
    private final ContactMessageRepository repo;
    private final ContactReplyRepository replyRepo;
    private final UserRepository userRepo;
    private final EmailService emailService;
    private final ContactAttachmentRepository attachmentRepo;
    private final FileStorage storage;
    private final StorageCleaner cleaner;

    // Photos, videos and PDFs a user may attach: allowed file types with the content type they are served as.
    // Only these types are accepted, so nothing that could run in a browser (HTML, SVG, scripts) is ever stored
    private static final Map<String, String> ATTACHMENT_TYPES = Map.ofEntries(
            Map.entry("jpg",  "image/jpeg"),
            Map.entry("jpeg", "image/jpeg"),
            Map.entry("png",  "image/png"),
            Map.entry("gif",  "image/gif"),
            Map.entry("webp", "image/webp"),
            Map.entry("mp4",  "video/mp4"),
            Map.entry("mov",  "video/quicktime"),
            Map.entry("webm", "video/webm"),
            Map.entry("pdf",  "application/pdf"));

    public static final int MAX_ATTACHMENTS = 5;
    public static final long MAX_ATTACHMENT_BYTES = 10L * 1024 * 1024;

    // A stored attachment opened for download
    public record AttachmentFile(String fileName, String mimeType, long sizeBytes, InputStream data) {}

    @Value("${internyay.contact.max-per-hour:5}")
    private int maxPerHour;

    // Message from a logged in user, the category must be one of the allowed ones
    public ContactMessageDto submit(User account, ContactRequest req) {
        return submit(account, req, List.of());
    }

    // Same, with photos, videos or PDFs attached. The message and its files are saved together or not at all
    @Transactional
    public ContactMessageDto submit(User account, ContactRequest req, List<MultipartFile> files) {

        String category = clean(req.category);
        if (!options.isOffered("CONTACT_CATEGORY", category)) {
            throw new IllegalArgumentException("Choose a valid category");
        }

        long recent = repo.countByAccountIdAndCreatedAtAfter(account.getId(), LocalDateTime.now().minusHours(1));
        if (recent >= maxPerHour) {
            throw new IllegalArgumentException(
                    "You've sent several messages in the last hour. Please wait a while before sending another.");
        }

        // Check every file before anything is saved
        List<MultipartFile> uploads = files == null ? List.of()
                : files.stream().filter(f -> f != null && !f.isEmpty()).toList();
        validateAttachments(uploads);

        ContactMessage saved = repo.save(ContactMessage.builder()
                .accountId(account.getId())
                .role(account.getRole())
                .name(clean(account.getName()))
                .email(clean(account.getEmail()).toLowerCase())
                .phone(blankToNull(account.getPhone()))
                .category(category)
                .subject(clean(req.subject).isEmpty() ? category : clean(req.subject).replaceAll("[\\r\\n]+", " "))
                .message(req.message.trim())
                .build());

        List<ContactAttachment> stored = storeAttachments(saved.getId(), uploads);
        return ContactMessageDto.from(saved, List.of(), stored);
    }

    // Landing page message, limited per email per hour to stop spam
    public void submitPublic(ContactPublicRequest req) {
        String email = clean(req.email).toLowerCase();
        long recent = repo.countByAccountIdIsNullAndEmailAndCreatedAtAfter(email, LocalDateTime.now().minusHours(1));
        if (recent >= maxPerHour) {
            throw new IllegalArgumentException("You've sent several messages recently. Please wait a while before sending another.");
        }

        String name = clean(req.name).replaceAll("[\\r\\n]+", " ");
        repo.save(ContactMessage.builder()
                .role(ContactMessage.VISITOR)
                .name(name.isEmpty() ? "Website visitor" : name)
                .email(email)
                .category("Landing page enquiry")
                .subject("Landing page enquiry")
                .message(req.description.trim())
                .build());
    }

    // User's own messages with replies
    public List<ContactMessageDto> mine(Long accountId) {
        return withReplies(repo.findByAccountIdOrderByCreatedAtDesc(accountId), true);
    }

    // Replies the user hasn't opened
    public long unreadReplies(Long accountId) {
        return repo.countByAccountIdAndUserUnreadTrue(accountId);
    }

    // Clears the unread flag, only on the user's own messages
    public void markSeen(Long accountId, Long id) {
        ContactMessage m = repo.findById(id).orElseThrow(() -> new NoSuchElementException("Message not found"));
        if (!m.getAccountId().equals(accountId)) throw new NoSuchElementException("Message not found");
        if (Boolean.TRUE.equals(m.getUserUnread())) {
            m.setUserUnread(false);
            repo.save(m);
        }
    }

    // Admin: all messages or one status
    public List<ContactMessageDto> list(String status) {
        List<ContactMessage> rows = (status == null || status.isBlank() || "ALL".equalsIgnoreCase(status))
                ? repo.findAllByOrderByCreatedAtDesc()
                : repo.findByStatusOrderByCreatedAtDesc(status.trim().toUpperCase());
        return withReplies(rows, false);
    }

    // Admin: NEW, READ or RESOLVED
    @Transactional
    public ContactMessageDto setStatus(Long id, String status) {
        String s = status == null ? "" : status.trim().toUpperCase();
        if (!STATUSES.contains(s)) throw new IllegalArgumentException("Status must be NEW, READ or RESOLVED");
        ContactMessage m = repo.findById(id).orElseThrow(() -> new NoSuchElementException("Message not found"));
        if (ContactMessage.VISITOR.equals(m.getRole()) && ContactMessage.RESOLVED.equals(s)) {
            throw new IllegalArgumentException("Landing-page queries cannot be marked resolved");
        }
        m.setStatus(s);
        return one(repo.save(m));
    }

    // Admin reply, sent by email, shown in the account, or both depending on the channel
    @Transactional
    public ContactMessageDto reply(Long id, String adminName, String body, String channelRaw) {
        String text = clean(body);
        if (text.isEmpty()) throw new IllegalArgumentException("Write a reply");

        ContactMessage m = repo.findById(id).orElseThrow(() -> new NoSuchElementException("Message not found"));

        String channel = m.getAccountId() == null ? ContactReply.EMAIL : parseChannel(channelRaw);
        boolean toEmail   = !ContactReply.ACCOUNT.equals(channel);
        boolean toAccount = !ContactReply.EMAIL.equals(channel);

        Boolean emailed = Boolean.FALSE;
        if (toEmail) {
            String to = m.getAccountId() == null
                    ? m.getEmail()
                    : userRepo.findById(m.getAccountId()).map(User::getEmail).orElse(m.getEmail());
            try {
                emailService.sendContactReplyNotification(to, m.getName(), m.getSubject(), text, toAccount,
                        m.getAccountId() == null);
                emailed = Boolean.TRUE;
            } catch (Exception e) {
                if (!toAccount) {
                    throw new IllegalStateException(
                            "The reply was not sent — email failed. " + clean(e.getMessage()));
                }
                log.warn("Reply to contact message {} saved to the account but not emailed: {}",
                        m.getId(), e.getMessage());
            }
        }

        replyRepo.save(ContactReply.builder()
                .messageId(m.getId())
                .adminName(clean(adminName).isEmpty() ? "InterNyay Support" : clean(adminName))
                .body(text)
                .channel(channel)
                .emailed(emailed)
                .build());

        if (toAccount) m.setUserUnread(true);
        if (ContactMessage.NEW.equals(m.getStatus())) m.setStatus(ContactMessage.READ);
        m = repo.save(m);

        return one(m);
    }

    // Deletes the message with all its replies and attached files
    @Transactional
    public void delete(Long id) {
        if (!repo.existsById(id)) throw new NoSuchElementException("Message not found");
        List<String> keys = attachmentRepo.findByMessageId(id).stream().map(ContactAttachment::getStorageKey).toList();
        replyRepo.deleteByMessageId(id);
        repo.deleteById(id);
        // The files go only after the database change has committed
        cleaner.deleteAfterCommit(keys);
    }

    // Opens an attachment. A user can open only the files of their own messages; the admin passes null to open any
    public AttachmentFile openAttachment(Long attachmentId, Long accountId) {
        ContactAttachment a = attachmentRepo.findById(attachmentId)
                .orElseThrow(() -> new NoSuchElementException("File not found"));
        if (accountId != null) {
            ContactMessage m = repo.findById(a.getMessageId())
                    .orElseThrow(() -> new NoSuchElementException("File not found"));
            if (m.getAccountId() == null || !m.getAccountId().equals(accountId)) {
                throw new NoSuchElementException("File not found");
            }
        }
        return new AttachmentFile(a.getFileName(), a.getMimeType(), a.getSizeBytes(), storage.open(a.getStorageKey()));
    }

    // At most 5 files of 10 MB each, photos, videos or PDFs only
    private static void validateAttachments(List<MultipartFile> files) {
        if (files.size() > MAX_ATTACHMENTS) {
            throw new IllegalArgumentException("You can attach up to " + MAX_ATTACHMENTS + " files");
        }
        for (MultipartFile f : files) {
            if (f.getSize() > MAX_ATTACHMENT_BYTES) {
                throw new IllegalArgumentException(
                        "\"" + shortName(f.getOriginalFilename()) + "\" is larger than 10 MB");
            }
            if (!ATTACHMENT_TYPES.containsKey(extension(f.getOriginalFilename()))) {
                throw new IllegalArgumentException(
                        "\"" + shortName(f.getOriginalFilename()) + "\" is not a photo, video or PDF");
            }
        }
    }

    // Writes the files to file storage and saves one row for each. A file written before a rollback is removed again
    private List<ContactAttachment> storeAttachments(Long messageId, List<MultipartFile> files) {
        List<ContactAttachment> saved = new ArrayList<>();
        for (MultipartFile f : files) {
            String ext = extension(f.getOriginalFilename());
            String key = FileStorage.newKey("contact");
            try (InputStream in = f.getInputStream()) {
                storage.put(key, in, f.getSize(), ATTACHMENT_TYPES.get(ext));
            } catch (IOException e) {
                throw new IllegalStateException("Could not save \"" + shortName(f.getOriginalFilename()) + "\"", e);
            }
            cleaner.deleteOnRollback(key);
            saved.add(attachmentRepo.save(ContactAttachment.builder()
                    .messageId(messageId)
                    .fileName(shortName(f.getOriginalFilename()))
                    .mimeType(ATTACHMENT_TYPES.get(ext))
                    .sizeBytes(f.getSize())
                    .storageKey(key)
                    .build()));
        }
        return saved;
    }

    // Lower case file extension without the dot, empty when there is none
    private static String extension(String fileName) {
        if (fileName == null) return "";
        int dot = fileName.lastIndexOf('.');
        return dot < 0 ? "" : fileName.substring(dot + 1).trim().toLowerCase(Locale.ROOT);
    }

    // File name without any folder part, at most 255 characters
    private static String shortName(String fileName) {
        String n = fileName == null ? "" : fileName.replace('\\', '/');
        n = n.substring(n.lastIndexOf('/') + 1).replaceAll("[\\r\\n]+", " ").trim();
        if (n.isEmpty()) n = "attachment";
        return n.length() > 255 ? n.substring(n.length() - 255) : n;
    }

    // Single message with its replies
    private ContactMessageDto one(ContactMessage m) {
        return withReplies(List.of(m), false).get(0);
    }

    // Loads all replies in one query and attaches them
    private List<ContactMessageDto> withReplies(List<ContactMessage> messages, boolean forUser) {
        if (messages.isEmpty()) return List.of();

        Map<Long, List<ContactReply>> byMessage = new HashMap<>();
        for (ContactReply r : replyRepo.findByMessageIdInOrderByCreatedAtAsc(
                messages.stream().map(ContactMessage::getId).toList())) {
            if (forUser && !r.shownToUser()) continue;
            byMessage.computeIfAbsent(r.getMessageId(), k -> new ArrayList<>()).add(r);
        }

        // Attached files, also in one query
        Map<Long, List<ContactAttachment>> filesByMessage = new HashMap<>();
        for (ContactAttachment a : attachmentRepo.findByMessageIdInOrderByIdAsc(
                messages.stream().map(ContactMessage::getId).toList())) {
            filesByMessage.computeIfAbsent(a.getMessageId(), k -> new ArrayList<>()).add(a);
        }

        return messages.stream()
                .map(m -> ContactMessageDto.from(m,
                        byMessage.getOrDefault(m.getId(), List.of()),
                        filesByMessage.getOrDefault(m.getId(), List.of())))
                .toList();
    }

    // EMAIL, ACCOUNT or BOTH, default BOTH
    private static String parseChannel(String raw) {
        if (raw == null || raw.isBlank()) return ContactReply.BOTH;
        String c = raw.trim().toUpperCase();
        if (!Set.of(ContactReply.EMAIL, ContactReply.ACCOUNT, ContactReply.BOTH).contains(c)) {
            throw new IllegalArgumentException("Send the reply by EMAIL, to the ACCOUNT, or BOTH");
        }
        return c;
    }

    // Trim, null becomes empty
    private static String clean(String v) {
        return v == null ? "" : v.trim();
    }

    // Empty becomes null
    private static String blankToNull(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }
}
