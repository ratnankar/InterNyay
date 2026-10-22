package com.internyay.service;

import com.internyay.dto.WhatsAppSendResultDto;
import com.internyay.dto.WhatsAppStatusDto;
import com.internyay.entity.*;
import com.internyay.entity.WhatsAppMessageLog.Kind;
import com.internyay.entity.WhatsAppMessageLog.Origin;
import com.internyay.entity.WhatsAppMessageLog.Status;
import com.internyay.repository.*;
import com.internyay.util.FeeMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.hibernate.Hibernate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Function;

// Hearing and payment reminders sent to clients through WhatsApp
@Service
@RequiredArgsConstructor
@Slf4j
public class WhatsAppReminderService {

    private final CourtService courtService;

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final DateTimeFormatter HEARING_DATE = DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", Locale.ENGLISH);
    private static final Set<Status> COUNTS_AS_SENT = EnumSet.of(Status.SENT, Status.DRY_RUN);

    private final CaseRepository caseRepo;
    private final WhatsAppMessageLogRepository logRepo;
    private final WhatsAppSender sender;
    private final TransactionTemplate tx;

    // Whether sending is configured, dry run, and automatic failures in the last 24 hours
    public WhatsAppStatusDto status(Long userId) {

        long failed = logRepo.countByUserIdAndOriginAndStatusAndCreatedAtAfter(
                userId, Origin.AUTO, Status.FAILED, LocalDateTime.now().minusHours(24));

        return new WhatsAppStatusDto(sender.isConfigured(), sender.isDryRun(), failed);
    }

    // Turn automatic reminders on or off for a case and optionally change the lead time
    @Transactional
    public boolean setCaseEnabled(Long userId, Long caseId, boolean enabled, Integer daysBefore) {
        Case c = findOwned(caseId, userId);
        c.setWhatsappReminders(enabled);
        if (daysBefore != null) {
            c.setReminderDaysBefore(daysBefore == 2 ? 2 : 1);
        }
        caseRepo.save(c);
        return enabled;
    }

    // Lead time for a case, default if unset
    public int getReminderDaysBefore(Long userId, Long caseId) {
        return findOwned(caseId, userId).getReminderDaysBeforeOrDefault();
    }

    // Manual hearing reminder, the case needs a next hearing date
    public WhatsAppSendResultDto sendHearingReminder(Long caseId, Long userId) {

        Case c = loadForSend(caseId, userId);

        if (c.getNextHearing() == null) {
            throw new IllegalArgumentException("This case has no next hearing date to remind about");
        }

        return deliver(c, Kind.HEARING_REMINDER, Origin.MANUAL, c.getNextHearing());
    }

    // Manual payment reminder, only when something is due
    public WhatsAppSendResultDto sendPaymentReminder(Long caseId, Long userId) {

        Case c = loadForSend(caseId, userId);

        if (amountDue(c).signum() <= 0) {
            throw new IllegalArgumentException("Nothing is due on this case");
        }

        return deliver(c, Kind.PAYMENT_DUE, Origin.MANUAL, null);
    }

    // Automatic reminders for hearings that many days away
    private int sendRemindersForDaysAhead(int daysAhead) {

        LocalDate target = LocalDate.now(IST).plusDays(daysAhead);

        int sent = 0;

        for (Case c : caseRepo.findByNextHearing(target)) {
            try {
                // Skip inactive advocates, cases with reminders off, a different lead time or a finished case
                if (Boolean.FALSE.equals(c.getUser().getActive()))                continue;
                if (!c.isWhatsappRemindersEnabled())                              continue;
                if (c.getReminderDaysBeforeOrDefault() != daysAhead)              continue;
                if (isFinished(c))                                                continue;

                sent += deliver(c, Kind.HEARING_REMINDER, Origin.AUTO, target).sent();

            // One failing case must not stop the rest
            } catch (Exception ex) {
                log.error("WhatsApp reminder failed for case {}", c.getId(), ex);
            }
        }

        return sent;
    }

    // Called by the scheduler: covers hearings 1 and 2 days ahead, each case matches only its own lead time
    public int sendTomorrowsReminders() {

        int sent = sendRemindersForDaysAhead(1) + sendRemindersForDaysAhead(2);

        log.info("WhatsApp reminders for {}: {} message(s) sent", LocalDate.now(IST), sent);
        return sent;
    }

    // Sends to every client on the case and logs each attempt
    private WhatsAppSendResultDto deliver(Case c, Kind kind, Origin origin, LocalDate hearingDate) {

        int sent = 0, failed = 0, noNumber = 0;
        boolean dry = false;
        List<String> problems = new ArrayList<>();

        Function<Client, List<String>> params = kind == Kind.PAYMENT_DUE
                ? cl -> paymentParams(c, cl)
                : cl -> hearingParams(c, cl, hearingDate);

        for (Client client : recipients(c)) {

            String phone = client.getWhatsapp_phone();
            if (phone == null || phone.isBlank()) {
                noNumber++;
                continue;
            }

            if (origin == Origin.AUTO && logRepo
                    .existsByCaseIdAndClientIdAndKindAndOriginAndHearingDateAndStatusIn(
                            c.getId(), client.getId(), kind, origin, hearingDate, COUNTS_AS_SENT)) {
                continue;
            }

            WhatsAppSender.Outcome out = sender.send(kind, phone, params.apply(client));

            saveLog(c, client, phone, kind, origin, hearingDate, out);

            if (out.ok()) {
                sent++;
                dry |= out.status() == Status.DRY_RUN;
            } else {
                failed++;
                problems.add(client.getName() + ": " + out.error());
            }
        }

        return new WhatsAppSendResultDto(sent, failed, noNumber, dry, problems);
    }

    // Logging must never break sending
    private void saveLog(Case c, Client client, String phone, Kind kind, Origin origin,
                         LocalDate hearingDate, WhatsAppSender.Outcome out) {
        try {
            WhatsAppMessageLog row = new WhatsAppMessageLog();
            row.setUserId(c.getUser().getId());
            row.setCaseId(c.getId());
            row.setClientId(client.getId());
            row.setPhone(phone);
            row.setKind(kind);
            row.setOrigin(origin);
            row.setStatus(out.status());
            row.setHearingDate(hearingDate);
            row.setError(out.error() != null && out.error().length() > 500
                    ? out.error().substring(0, 500) : out.error());
            logRepo.save(row);
        } catch (Exception ex) {
            log.error("Could not record WhatsApp message log for case {}", c.getId(), ex);
        }
    }

    // Main client plus additional clients, no duplicates
    private List<Client> recipients(Case c) {
        Map<Long, Client> byId = new LinkedHashMap<>();
        if (c.getClient() != null) byId.put(c.getClient().getId(), c.getClient());
        if (c.getAdditionalClients() != null) {
            for (Client cl : c.getAdditionalClients()) byId.putIfAbsent(cl.getId(), cl);
        }
        return new ArrayList<>(byId.values());
    }

    // Values for the approved hearing reminder template
    private List<String> hearingParams(Case c, Client client, LocalDate date) {
        return List.of(
                client.getName(),
                messageTitle(c),
                caseNoText(c),
                date.format(HEARING_DATE),
                courtLine(c),
                advocateName(c));
    }

    // Values for the payment template, amount in Indian number format
    private List<String> paymentParams(Case c, Client client) {
        NumberFormat inr = NumberFormat.getNumberInstance(Locale.of("en", "IN"));
        inr.setMaximumFractionDigits(2);
        inr.setMinimumFractionDigits(0);

        return List.of(
                client.getName(),
                messageTitle(c),
                caseNoText(c),
                "Rs. " + inr.format(amountDue(c)),
                advocateName(c));
    }

    // Case number for the message; a Juvenile Justice Board case has none, and a template value cannot be empty
    private static String caseNoText(Case c) {
        return c.getCaseNo() == null || c.getCaseNo().isBlank() ? "-" : c.getCaseNo();
    }

    // Case title for the message, "A vs B", "A vs. B" or "A v/s B" is sent as "A v. B"
    private String messageTitle(Case c) {
        String title = c.getTitle() == null ? "" : c.getTitle();
        return title.replaceAll("(?i)\\s+(?:vs\\.?|v/s|v\\.?)\\s+", " v. ");
    }

    // Court name with court number, high courts don't get the word "Court" added
    private String courtLine(Case c) {
        String court = c.getCourt() == null ? "" : c.getCourt();
        String label = courtService.highCourt(court).isPresent() ? court : court + " Court";
        boolean hasNo = c.getCourtNo() != null && !c.getCourtNo().isBlank();
        return hasNo ? label + ", Court No. " + c.getCourtNo().trim() : label;
    }

    // Advocate's name for the message
    private String advocateName(Case c) {
        return c.getUser() != null && c.getUser().getName() != null ? c.getUser().getName() : "your advocate";
    }

    // Unpaid amount depending on the fee type: date wise, stage wise or one time
    private BigDecimal amountDue(Case c) {

        BigDecimal due = BigDecimal.ZERO;

        if (FeeMapper.DATEWISE.equalsIgnoreCase(c.getFeeType())) {

            if (c.getInitialAmount() != null && !c.isInitialPaid()) {
                due = due.add(c.getInitialAmount());
            }
            due = due.add(hearingFeesDue(c));

        } else if (FeeMapper.STAGEWISE.equalsIgnoreCase(c.getFeeType())) {

            if (c.getStageFees() != null) {
                for (StageFee f : c.getStageFees()) {
                    if (!f.isPaid() && f.getAmount() != null) due = due.add(f.getAmount());
                }
            }

        } else {

            if (c.getInitialAmount() != null && !c.isInitialPaid()) {
                due = due.add(c.getInitialAmount());
            }
            if (c.getTotalFeeAmount() != null && !c.isTotalFeePaid()) {
                due = due.add(c.getTotalFeeAmount());
            }
            due = due.add(hearingFeesDue(c));
        }

        return due;
    }

    // Unpaid hearing fees
    private BigDecimal hearingFeesDue(Case c) {
        BigDecimal due = BigDecimal.ZERO;
        if (c.getHearingFees() == null) return due;

        for (HearingFee f : c.getHearingFees()) {
            BigDecimal charged = f.getAmount() != null ? f.getAmount() : c.getDateWiseAmount();
            if (charged == null) continue;

            BigDecimal received = f.getAmountReceived() != null
                    ? f.getAmountReceived()
                    : (f.isPaid() ? charged : BigDecimal.ZERO);

            BigDecimal remaining = charged.subtract(received);
            if (remaining.signum() > 0) due = due.add(remaining);
        }
        return due;
    }

    // Closed cases get no reminders
    private boolean isFinished(Case c) {
        return com.internyay.util.CaseStatuses.isClosed(c.getStatus());
    }

    private Case loadForSend(Long id, Long userId) {
        return tx.execute(status -> {
            Case c = findOwned(id, userId);
            Hibernate.initialize(c.getUser());
            Hibernate.initialize(c.getClient());
            Hibernate.initialize(c.getAdditionalClients());
            Hibernate.initialize(c.getHearingFees());
            Hibernate.initialize(c.getStageFees());
            return c;
        });
    }

    // Case must belong to the user
    private Case findOwned(Long id, Long userId) {
        Case c = caseRepo.findById(id).orElseThrow(() -> new RuntimeException("Case not found"));
        if (!c.getUser().getId().equals(userId)) throw new RuntimeException("Forbidden");
        return c;
    }
}
