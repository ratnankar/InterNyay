package com.internyay.service.chat;

import com.internyay.entity.Case;
import com.internyay.entity.HearingFee;
import com.internyay.entity.StageFee;
import com.internyay.util.FeeMapper;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

// Works out billed, received and due for a case whatever its fee type
final class FeeSummary {

    // One fee line: label, date, amount and how much has been paid
    record Line(String label, LocalDate date, BigDecimal amount, BigDecimal received, boolean paid) {

        BigDecimal collected() {
            if (received != null) return received.min(amount);
            return paid ? amount : BigDecimal.ZERO;
        }

        BigDecimal remaining() {
            return amount.subtract(collected()).max(BigDecimal.ZERO);
        }
    }

    private final List<Line> lines = new ArrayList<>();
    private final Case legalCase;

    private FeeSummary(Case legalCase) {
        this.legalCase = legalCase;
    }

    // Builds the summary for a case
    static FeeSummary of(Case c) {
        FeeSummary summary = new FeeSummary(c);
        summary.build();
        return summary;
    }

    // Everything billed
    BigDecimal total() {
        return lines.stream().map(Line::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    // Everything collected
    BigDecimal paid() {
        return lines.stream().map(Line::collected).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    // Billed minus collected
    BigDecimal due() {
        return total().subtract(paid());
    }

    // Result for the chat tool, optionally with every line
    Map<String, Object> toMap(boolean withLines) {
        Rec rec = Rec.of()
                .put("feeType", label(legalCase.getFeeType()))
                .always("totalBilled", total())
                .always("totalReceived", paid())
                .always("balanceDue", due());

        if (withLines) {
            rec.put("lines", lines.stream().map(l -> Rec.of()
                    .put("label", l.label())
                    .put("date", l.date())
                    .always("amount", l.amount())
                    .always("received", l.collected())
                    .always("remaining", l.remaining())
                    .always("paid", l.remaining().signum() == 0 && l.amount().signum() > 0)
                    .map()).toList());
        }
        return rec.map();
    }

    // Lines depend on the fee type: date wise, stage wise or one time
    private void build() {
        Case c = legalCase;
        String type = c.getFeeType();

        if (FeeMapper.DATEWISE.equalsIgnoreCase(type)) {
            initial(c.getInitialAmount(), c.getInitialAmountDate(), c.isInitialPaid(), "Initial Amount");
            hearingFees(c.getDateWiseAmount());

        } else if (FeeMapper.STAGEWISE.equalsIgnoreCase(type)) {
            if (c.getStageFees() != null) {
                for (StageFee f : c.getStageFees()) {
                    String name = f.getName() == null ? "" : f.getName().trim();
                    BigDecimal amount = nz(f.getAmount());
                    if (name.isEmpty() && amount.signum() == 0) continue;
                    lines.add(new Line(name.isEmpty() ? "Stage" : "Stage — " + name, null, amount, null, f.isPaid()));
                }
            }

        } else {
            initial(c.getInitialAmount(), c.getInitialAmountDate(), c.isInitialPaid(), "Initial Amount");
            initial(c.getTotalFeeAmount(), c.getTotalFeeAmountDate(), c.isTotalFeePaid(), "One-Time Fee");
            hearingFees(null);
        }
    }

    // Adds the initial/one-time line when it has an amount
    private void initial(BigDecimal amount, LocalDate date, boolean paid, String label) {
        if (amount == null || amount.signum() == 0) return;
        lines.add(new Line(label, date, amount, null, paid));
    }

    // Per hearing fee lines
    private void hearingFees(BigDecimal reference) {
        if (legalCase.getHearingFees() == null) return;

        for (HearingFee row : legalCase.getHearingFees()) {
            boolean hasOwn = row.getAmount() != null;
            boolean hasReceived = row.getAmountReceived() != null;
            BigDecimal received = hasReceived ? row.getAmountReceived() : BigDecimal.ZERO;

            BigDecimal amount = hasOwn ? row.getAmount() : reference != null ? reference : received;
            BigDecimal finalReceived = hasReceived ? received : (row.isPaid() ? amount : BigDecimal.ZERO);

            lines.add(new Line(row.getDate() != null ? "Hearing Fee — " + row.getDate() : "Hearing Fee",
                    row.getDate(), amount, finalReceived, false));
        }
    }

    // Readable fee type name
    private static String label(String feeType) {
        if (feeType == null) return "One-Time";
        return switch (feeType.toUpperCase()) {
            case "DATEWISE" -> "Date Wise";
            case "STAGEWISE" -> "Stage Wise";
            default -> "One-Time";
        };
    }

    // Null becomes zero
    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
