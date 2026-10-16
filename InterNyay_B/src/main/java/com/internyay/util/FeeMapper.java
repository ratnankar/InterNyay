package com.internyay.util;

import com.internyay.dto.CaseRequest;
import com.internyay.dto.HearingFeeRequest;
import com.internyay.dto.StageFeeRequest;
import com.internyay.entity.Case;
import com.internyay.entity.HearingFee;
import com.internyay.entity.StageFee;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.function.Consumer;

// Copies the fee fields of a case request onto the Case entity
public final class FeeMapper {

    // Fee types
    public static final String TOTAL = "TOTAL";
    public static final String DATEWISE = "DATEWISE";

    // Fee paid in stages
    public static final String STAGEWISE = "STAGEWISE";

    // Fee types that can be chosen
    private static final List<String> FEE_TYPES = List.of(TOTAL, DATEWISE, STAGEWISE);

    // Utility class, no objects
    private FeeMapper() {}

    // Applies only the fields that came in the request
    public static void applyFeeFields(Case c, CaseRequest req) {

        // Fee type
        if (req.getFeeType() != null && !req.getFeeType().isBlank()) {
            c.setFeeType(canonicalFeeType(req.getFeeType()));
        }

        // Total fee, the date is saved when the amount changes
        if (req.getTotalFeeAmount() != null) {
            BigDecimal amount = parseAmount(req.getTotalFeeAmount());
            stampDateIfChanged(amount, c.getTotalFeeAmount(), c::setTotalFeeAmountDate);
            c.setTotalFeeAmount(amount);
        }

        if (req.getTotalFeePaid() != null) {
            c.setTotalFeePaid(req.getTotalFeePaid());
        }

        // Initial amount, the date is saved when the amount changes
        if (req.getInitialAmount() != null) {
            BigDecimal amount = parseAmount(req.getInitialAmount());
            stampDateIfChanged(amount, c.getInitialAmount(), c::setInitialAmountDate);
            c.setInitialAmount(amount);
        }

        if (req.getInitialPaid() != null) {
            c.setInitialPaid(req.getInitialPaid());
        }

        // Amount charged for each hearing
        if (req.getDateWiseAmount() != null) {
            c.setDateWiseAmount(parseAmount(req.getDateWiseAmount()));
        }

        // Hearing wise fees are rebuilt from the request
        if (req.getHearingFees() != null) {

            if (c.getHearingFees() == null) {
                c.setHearingFees(new java.util.ArrayList<>());
            }

            // Remember when each fee was paid so the time is not lost on save
            Map<String, LocalDateTime> oldPaidAt = new HashMap<>();
            for (HearingFee old : c.getHearingFees()) {
                if (old.isPaid() && old.getPaidAt() != null) oldPaidAt.put(String.valueOf(old.getDate()), old.getPaidAt());
            }

            c.getHearingFees().clear();

            for (HearingFeeRequest h : req.getHearingFees()) {
                BigDecimal amount = parseAmount(h.getAmount());
                BigDecimal received = parseAmount(h.getAmountReceived());

                // Paid once the amount received covers the amount
                boolean paid = amount != null
                        ? received != null && received.compareTo(amount) >= 0
                        : (h.getPaid() != null && h.getPaid());

                c.getHearingFees().add(
                        HearingFee.builder()
                                .date(parseDate(h.getDate()))
                                .amount(amount)
                                .amountReceived(received)
                                .paid(paid)
                                .paidAt(resolvePaidAt(paid, oldPaidAt.get(String.valueOf(parseDate(h.getDate())))))
                                .legalCase(c)
                                .build()
                );
            }
        }

        // Stage wise fees
        if (req.getStageFees() != null) {
            applyStageFees(c, req.getStageFees());
        }
    }

    // Rebuilds the stage fees of the case
    private static void applyStageFees(Case c, List<StageFeeRequest> requested) {

        if (c.getStageFees() == null) {
            c.setStageFees(new java.util.ArrayList<>());
        }

        Map<String, LocalDateTime> oldPaidAt = new HashMap<>();
        for (StageFee old : c.getStageFees()) {
            if (old.isPaid() && old.getPaidAt() != null) oldPaidAt.put(feeKey(old.getName(), null), old.getPaidAt());
        }

        c.getStageFees().clear();

        for (StageFeeRequest s : requested) {
            String name = s.getName() == null ? null : s.getName().trim();
            BigDecimal amount = parseAmount(s.getAmount());

            if ((name == null || name.isEmpty()) && amount == null) continue;

            c.getStageFees().add(
                    StageFee.builder()
                            .name(name == null || name.isEmpty() ? null : name)
                            .amount(amount)
                            .paid(s.getPaid() != null && s.getPaid())
                            .paidAt(resolvePaidAt(s.getPaid() != null && s.getPaid(),
                                    oldPaidAt.get(feeKey(name == null || name.isEmpty() ? null : name, null))))
                            .legalCase(c)
                            .build()
            );
        }
    }

    // Returns the fee type in its proper spelling, throws when it is invalid
    private static String canonicalFeeType(String raw) {
        String wanted = raw.trim();
        return FEE_TYPES.stream()
                .filter(t -> t.equalsIgnoreCase(wanted))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Fee type must be one of " + String.join(", ", FEE_TYPES)));
    }

    // Saves today's date only when the amount actually changed
    private static void stampDateIfChanged(BigDecimal newAmount, BigDecimal oldAmount, Consumer<LocalDate> setDate) {
        boolean changed = newAmount == null
                ? oldAmount != null
                : oldAmount == null || newAmount.compareTo(oldAmount) != 0;

        if (!changed) return;

        setDate.accept(newAmount != null ? LocalDate.now() : null);
    }

    // Keeps the old paid time, or uses now when it was just marked paid
    private static LocalDateTime resolvePaidAt(boolean paid, LocalDateTime previous) {
        if (!paid) return null;
        return previous != null ? previous : LocalDateTime.now();
    }

    // Key used to match an old fee with the same fee in the request
    private static String feeKey(String name, LocalDate date) {
        return (name == null ? "" : name.trim().toLowerCase()) + "|" + date;
    }

    // Amount from text, null when empty or not a number
    public static BigDecimal parseAmount(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return new BigDecimal(raw.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // Date from yyyy-MM-dd text, null when empty or invalid
    public static LocalDate parseDate(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
