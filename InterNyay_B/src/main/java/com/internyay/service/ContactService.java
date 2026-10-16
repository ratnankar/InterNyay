package com.internyay.service;

import com.internyay.dto.ContactMessageDto;
import com.internyay.dto.ContactPublicRequest;
import com.internyay.dto.ContactRequest;
import com.internyay.entity.ContactMessage;
import com.internyay.entity.ContactReply;
import com.internyay.entity.User;
import com.internyay.repository.ContactMessageRepository;
import com.internyay.repository.ContactReplyRepository;
import com.internyay.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
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

    @Value("${internyay.contact.max-per-hour:5}")
    private int maxPerHour;

    // Message from a logged in user, the category must be one of the allowed ones
    public ContactMessageDto submit(User account, ContactRequest req) {

        String category = clean(req.category);
        if (!options.isOffered("CONTACT_CATEGORY", category)) {
            throw new IllegalArgumentException("Choose a valid category");
        }

        long recent = repo.countByAccountIdAndCreatedAtAfter(account.getId(), LocalDateTime.now().minusHours(1));
        if (recent >= maxPerHour) {
            throw new IllegalArgumentException(
                    "You've sent several messages in the last hour. Please wait a while before sending another.");
        }

        ContactMessage saved = repo.save(ContactMessage.builder()
                .accountId(account.getId())
                .role(account.getRole())
                .name(clean(account.getName()))
                .email(clean(account.getEmail()).toLowerCase())
                .phone(blankToNull(account.getPhone()))
                .category(category)
                .subject(clean(req.subject).replaceAll("[\\r\\n]+", " "))
                .message(req.message.trim())
                .build());

        return ContactMessageDto.from(saved, List.of());
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

    // Deletes the message with all its replies
    @Transactional
    public void delete(Long id) {
        if (!repo.existsById(id)) throw new NoSuchElementException("Message not found");
        replyRepo.deleteByMessageId(id);
        repo.deleteById(id);
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

        return messages.stream()
                .map(m -> ContactMessageDto.from(m, byMessage.getOrDefault(m.getId(), List.of())))
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
