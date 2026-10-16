package com.internyay.service;

import com.internyay.dto.OfficeExpenseDto;
import com.internyay.dto.OfficeExpenseRequest;
import com.internyay.entity.OfficeExpense;
import com.internyay.entity.User;
import com.internyay.repository.OfficeExpenseRepository;
import com.internyay.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

// Office expenses and associate payment requests
@Service
@RequiredArgsConstructor
public class OfficeExpenseService {

    private final OfficeExpenseRepository expenseRepo;
    private final UserRepository userRepo;
    private final QrCodeService qrCodeService;

    // Associates only see what they submitted, advocates see everything
    @Transactional(readOnly = true)
    public List<OfficeExpenseDto> list(Long userId, Long accountId, boolean isAssociate) {
        List<OfficeExpense> rows = isAssociate
                ? expenseRepo.findByUser_IdAndSubmittedBy_IdOrderByCreatedAtDesc(userId, accountId)
                : expenseRepo.findByUser_IdOrderByCreatedAtDesc(userId);
        return rows.stream()
                .map(e -> OfficeExpenseDto.from(e, qrCodeService.resolve(e.getQrCodeId())))
                .collect(Collectors.toList());
    }

    // Expense with optional UPI id / QR image to pay the submitter
    @Transactional
    public OfficeExpenseDto create(OfficeExpenseRequest req, Long userId, Long accountId) {
        User submitter = userRepo.findById(accountId).orElseThrow();

        String upiId   = blank(req.getUpiId());
        String qrImage = blank(req.getQrImage());

        boolean selfSubmitted = submitter.isAdvocate();

        OfficeExpense e = OfficeExpense.builder()
                .user(userRepo.getReferenceById(userId))
                .submittedBy(submitter)
                .description(req.getDescription())
                .amount(req.getAmount())
                .upiId(upiId != null ? upiId : submitter.getUpiId())
                .qrCodeId(qrImage != null ? qrCodeService.store(accountId, qrImage) : submitter.getQrCodeId())
                .paid(selfSubmitted)
                .paidAt(selfSubmitted ? LocalDateTime.now() : null)
                .build();
        OfficeExpense saved = expenseRepo.save(e);
        return OfficeExpenseDto.from(saved, qrCodeService.resolve(saved.getQrCodeId()));
    }

    // Mark paid or unpaid, advocate entries are settled automatically so they can't be toggled
    @Transactional
    public OfficeExpenseDto setPaid(Long id, boolean paid, Long userId) {
        OfficeExpense e = findOwned(id, userId);
        if (e.getSubmittedBy().isAdvocate()) {
            throw new IllegalArgumentException("Office expenses are settled automatically and can't be changed");
        }
        e.setPaid(paid);
        e.setPaidAt(paid ? LocalDateTime.now() : null);
        OfficeExpense saved = expenseRepo.save(e);
        return OfficeExpenseDto.from(saved, qrCodeService.resolve(saved.getQrCodeId()));
    }

    // Associates can only delete their own entries
    @Transactional
    public void delete(Long id, Long userId, Long accountId, boolean isAssociate) {
        OfficeExpense e = findOwned(id, userId);
        if (isAssociate && !e.getSubmittedBy().getId().equals(accountId)) {
            throw new AccessDeniedException("You can only remove your own expense entries");
        }
        if (e.isPaid()) {
            throw new IllegalArgumentException("This expense is already marked paid and can't be removed");
        }
        expenseRepo.delete(e);
    }

    // Expense by id, must belong to this advocate
    private OfficeExpense findOwned(Long id, Long userId) {
        OfficeExpense e = expenseRepo.findWithPeopleById(id)
                .orElseThrow(() -> new NoSuchElementException("Office expense not found"));
        if (!e.getUser().getId().equals(userId)) {
            throw new AccessDeniedException("Forbidden");
        }
        return e;
    }

    private String blank(String s) { return (s == null || s.isBlank()) ? null : s; }
}
