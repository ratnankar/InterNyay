package com.internyay.service;

import com.internyay.dto.*;
import com.internyay.entity.Plan;
import com.internyay.entity.User;
import com.internyay.repository.PlanRepository;
import com.internyay.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

// Subscription plans and the features they unlock
@Service
@RequiredArgsConstructor
public class PlanService {

    private final PlanRepository planRepo;
    private final UserRepository userRepo;

    // Plans shown on the landing page: business plans are left out, they are not for advocates
    @Transactional(readOnly = true)
    public List<PlanDto> landingPlans() {
        return allPlans().stream().filter(p -> p.enabled && !isBusiness(p)).toList();
    }

    // All plans in display order
    @Transactional(readOnly = true)
    public List<PlanDto> allPlans() {
        String defaultCode = defaultPlanCode();
        return planRepo.findAllByOrderBySortOrderAsc().stream().map(p -> {
            PlanDto d = PlanDto.from(p);
            d.usersCount = userRepo.countAdvocatesOnPlan(p.getCode(), p.getCode().equals(defaultCode));
            return d;
        }).toList();
    }

    // Accounts with no plan code belong to the default plan (Free while it exists)
    private boolean isDefaultSlot(String code) {
        return code != null && code.equals(defaultPlanCode());
    }

    // Plan code given to an account that has none: Free when it exists, otherwise the first plan an advocate can
    // use (enabled, open, not business-only), otherwise the first plan there is
    @Transactional(readOnly = true)
    public String defaultPlanCode() {
        if (planRepo.findByCode(Plan.FREE).isPresent()) return Plan.FREE;
        List<Plan> all = planRepo.findAllByOrderBySortOrderAsc();
        return all.stream()
                .filter(p -> p.isEnabled() && !p.isComingSoon() && !Plan.AUDIENCE_BUSINESS.equals(p.getAudience()))
                .findFirst()
                .or(() -> all.stream().findFirst())
                .map(Plan::getCode)
                .orElse(Plan.FREE);
    }

    // Plans an advocate can pick from: plans the admin marked as coming soon and business plans are left out.
    // The admin list (allPlans) still includes them.
    @Transactional(readOnly = true)
    public List<PlanDto> advocatePlans() {
        return allPlans().stream().filter(p -> p.enabled && !p.comingSoon && !isBusiness(p)).toList();
    }

    // True when the plan is meant for business accounts only (BOTH plans are not business-only)
    private static boolean isBusiness(PlanDto p) {
        return Plan.AUDIENCE_BUSINESS.equals(p.audience);
    }

    // Audience text from the admin: blank keeps the fallback, anything but ADVOCATE, BUSINESS or BOTH is refused
    private static String audienceOf(String raw, String fallback) {
        if (raw == null || raw.isBlank()) return fallback;
        String a = raw.trim().toUpperCase();
        if (!Plan.AUDIENCE_ADVOCATE.equals(a) && !Plan.AUDIENCE_BUSINESS.equals(a) && !Plan.AUDIENCE_BOTH.equals(a)) {
            throw new IllegalArgumentException("Audience must be ADVOCATE, BUSINESS or BOTH");
        }
        return a;
    }

    // Two audiences compete for the "Most popular" badge when they are the same or either one is BOTH
    private static boolean audiencesOverlap(String a, String b) {
        return a.equals(b) || Plan.AUDIENCE_BOTH.equals(a) || Plan.AUDIENCE_BOTH.equals(b);
    }

    // Only one plan per audience can carry the "Most popular" badge: when the saved plan has it, the others that
    // are shown to the same people (same audience, or either one is BOTH) lose it
    private void keepOnePopular(Plan chosen) {
        if (!chosen.isMostPopular()) return;
        String audience = chosen.getAudience() == null ? Plan.AUDIENCE_ADVOCATE : chosen.getAudience();
        for (Plan other : planRepo.findAll()) {
            String otherAudience = other.getAudience() == null ? Plan.AUDIENCE_ADVOCATE : other.getAudience();
            if (!other.getId().equals(chosen.getId()) && other.isMostPopular() && audiencesOverlap(audience, otherAudience)) {
                other.setMostPopular(false);
                planRepo.save(other);
            }
        }
    }

    // Plan of an advocate, FREE when none is set
    @Transactional(readOnly = true)
    public Plan planOf(User advocate) {
        String code = advocate.getPlanCode() == null || advocate.getPlanCode().isBlank()
                ? defaultPlanCode() : advocate.getPlanCode();
        return planRepo.findByCode(code)
                .or(() -> planRepo.findByCode(defaultPlanCode()))
                .orElseThrow(() -> new NoSuchElementException("Plans are not set up"));
    }

    // Associates this advocate may add: the limit an admin set for them, otherwise the plan's limit (negative = unlimited)
    public int associateLimitOf(User advocate, Plan plan) {
        if (advocate.getAssociateLimit() != null) return advocate.getAssociateLimit();
        return plan.getAssociateLimit() == null ? 0 : plan.getAssociateLimit();
    }

    // Current plan and how many associate seats are used
    @Transactional(readOnly = true)
    public MyPlanDto myPlan(User advocate) {
        Plan plan = planOf(advocate);
        PlanDto current = PlanDto.from(plan);
        // The plan card shows this advocate's real limit, including one set by an admin
        current.associateLimit = associateLimitOf(advocate, plan);
        return MyPlanDto.builder()
                .current(current)
                .associatesUsed(userRepo.countByAdvocate_Id(advocate.getId()))
                .available(advocatePlans())
                .build();
    }

    @Transactional
    public MyPlanDto choosePlan(User advocate, String rawCode, boolean yearly) {
        String code = rawCode == null ? "" : rawCode.trim().toUpperCase();
        Plan target = planRepo.findByCode(code).orElseThrow(() -> new NoSuchElementException("Plan not found"));
        if (!target.isEnabled()) {
            throw new IllegalArgumentException("This plan is not available");
        }
        if (target.isComingSoon()) {
            throw new IllegalArgumentException("This plan is not open yet");
        }
        if (Plan.AUDIENCE_BUSINESS.equals(target.getAudience())) {
            throw new IllegalArgumentException("This plan is not available for advocate accounts");
        }
        if (!target.isFreeFor(yearly)) {
            throw new IllegalArgumentException("This plan is not free. Please request it from My Plan");
        }
        User owner = userRepo.findById(advocate.getId()).orElseThrow(() -> new NoSuchElementException("User not found"));
        long used = userRepo.countByAdvocate_Id(owner.getId());
        int limit = associateLimitOf(owner, target);
        if (limit >= 0 && used > limit) {
            throw new IllegalArgumentException("You have " + used + " associates but the " + target.getName()
                    + " plan allows " + limit + ". Remove some associates before switching");
        }
        owner.setPlanCode(target.getCode());
        userRepo.save(owner);
        return myPlan(owner);
    }

    // Who can move from one plan to another: the target rules match the single-account change in Admin -> Accounts
    // (it must exist, be enabled and not coming soon; a business-only plan only from a business-only plan).
    // An advocate with more associates than the target plan allows cannot move and is listed in skipped.
    private record Move(Plan from, Plan to, int total, List<User> movable, List<PlanMigrateResult.Skipped> skipped) {}

    private Move planMove(String rawFrom, String rawTo) {
        String fromCode = rawFrom == null ? "" : rawFrom.trim().toUpperCase();
        String toCode = rawTo == null ? "" : rawTo.trim().toUpperCase();

        Plan from = planRepo.findByCode(fromCode).orElseThrow(() -> new NoSuchElementException("Plan to move from not found"));
        Plan to = planRepo.findByCode(toCode).orElseThrow(() -> new NoSuchElementException("Plan to move to not found"));
        if (from.getCode().equals(to.getCode())) {
            throw new IllegalArgumentException("Choose two different plans");
        }
        if (!to.isEnabled()) {
            throw new IllegalArgumentException("The " + to.getName() + " plan is disabled and cannot be assigned");
        }
        if (to.isComingSoon()) {
            throw new IllegalArgumentException("The " + to.getName() + " plan is marked as coming soon and cannot be assigned yet");
        }
        if (Plan.AUDIENCE_BUSINESS.equals(to.getAudience()) && !Plan.AUDIENCE_BUSINESS.equals(from.getAudience())) {
            throw new IllegalArgumentException(
                    "The " + to.getName() + " plan is for business accounts only. Set it to Both in Pricing Plans to give it to advocates");
        }

        List<User> accounts = userRepo.findAdvocatesOnPlan(from.getCode(), isDefaultSlot(from.getCode()));
        int limit = to.getAssociateLimit() == null ? 0 : to.getAssociateLimit();
        List<PlanMigrateResult.Skipped> skipped = new java.util.ArrayList<>();
        List<User> movable = new java.util.ArrayList<>();
        for (User u : accounts) {
            long associates = userRepo.countByAdvocate_Id(u.getId());
            int allowed = associateLimitOf(u, to);
            if (allowed >= 0 && associates > allowed) {
                skipped.add(PlanMigrateResult.Skipped.builder()
                        .id(u.getId()).name(u.getName()).email(u.getEmail())
                        .reason(associates + " associates, the " + to.getName() + " plan allows " + allowed)
                        .build());
            } else {
                movable.add(u);
            }
        }
        return new Move(from, to, accounts.size(), movable, skipped);
    }

    // Moves every advocate account on one plan to another plan. Accounts that cannot move stay where they are and are
    // listed, so one account never blocks the rest. dryRun only reports who would move.
    @Transactional
    public PlanMigrateResult migrateAll(PlanMigrateRequest r) {
        boolean dryRun = Boolean.TRUE.equals(r.getDryRun());
        Move m = planMove(r.getFromCode(), r.getToCode());
        if (!dryRun && !m.movable().isEmpty()) {
            m.movable().forEach(u -> u.setPlanCode(m.to().getCode()));
            userRepo.saveAll(m.movable());
        }
        return PlanMigrateResult.builder()
                .fromCode(m.from().getCode()).toCode(m.to().getCode()).dryRun(dryRun)
                .total(m.total()).moved(m.movable().size()).skipped(m.skipped())
                .build();
    }

    public static final java.util.Map<String, String> CATALOG = new java.util.LinkedHashMap<>();
    static {
        CATALOG.put("documents", "Document storage");
        CATALOG.put("office_expenses", "Office expenses");
        CATALOG.put("transactions", "Fees & transactions");
        CATALOG.put("legal_forms", "Legal forms library");
        CATALOG.put("court_fee_calculator", "Court fee calculator");
        CATALOG.put("whatsapp_reminders", "WhatsApp hearing reminders");
        CATALOG.put("chat_assistant", "AI chat assistant");
    }

    // A plan without a feature list gets every feature
    @Transactional(readOnly = true)
    public List<String> enabledFeatures(User advocate) {
        Plan p = planOf(advocate);
        if (p.getFeatureKeys() == null) return List.copyOf(CATALOG.keySet());
        return PlanDto.from(p).featureKeys;
    }

    // Check one feature
    @Transactional(readOnly = true)
    public boolean hasFeature(User advocate, String key) {
        return enabledFeatures(advocate).contains(key);
    }

    // Blocks adding an associate once the plan limit is reached, a negative limit means unlimited
    public void assertAssociateSeat(User advocate) {
        int limit = associateLimitOf(advocate, planOf(advocate));
        if (limit < 0) return;
        if (userRepo.countByAdvocate_Id(advocate.getId()) >= limit) {
            throw new IllegalArgumentException(
                    "This advocate's plan has reached its associate limit. Ask the advocate to upgrade their plan.");
        }
    }

    // A discount price needs a price and must be lower than it (blank discount is always fine)
    // (label is "" for the monthly price and "yearly " for the yearly one, only used in the messages)
    private void checkDiscount(Integer price, Integer discountPrice, String label) {
        if (discountPrice == null) return;
        if (price == null || price <= 0) {
            throw new IllegalArgumentException("Enter a " + label + "price before adding a " + label + "discount price");
        }
        if (discountPrice >= price) {
            throw new IllegalArgumentException("The " + label + "discount price must be lower than the " + label + "price");
        }
    }

    // Admin edits a plan. The price is always applied, so a blank price clears it (it is not turned into 0);
    // the other fields are only changed when they were sent
    @Transactional
    public PlanDto update(Long id, PlanRequest r) {
        Plan p = planRepo.findById(id).orElseThrow(() -> new NoSuchElementException("Plan not found"));
        if (r.getName() != null && !r.getName().isBlank()) p.setName(r.getName().trim());
        if (r.getTagline() != null)        p.setTagline(r.getTagline().trim());
        p.setPriceMonthly(r.getPriceMonthly());
        checkDiscount(r.getPriceMonthly(), r.getDiscountPrice(), "");
        p.setDiscountPrice(r.getDiscountPrice());
        // The yearly price works like the monthly one: always applied, so a blank value clears it
        p.setPriceYearly(r.getPriceYearly());
        checkDiscount(r.getPriceYearly(), r.getDiscountPriceYearly(), "yearly ");
        p.setDiscountPriceYearly(r.getDiscountPriceYearly());
        if (r.getComingSoon() != null)     p.setComingSoon(r.getComingSoon());
        if (r.getAudience() != null)       p.setAudience(audienceOf(r.getAudience(), p.getAudience()));
        if (r.getMostPopular() != null)    p.setMostPopular(r.getMostPopular());
        if (r.getAssociateLimit() != null) p.setAssociateLimit(r.getAssociateLimit());
        if (r.getFeatures() != null) {
            p.setFeatures(String.join("\n", r.getFeatures().stream()
                    .map(String::trim).filter(s -> !s.isEmpty()).toList()));
        }
        if (r.getFeatureKeys() != null) {
            p.setFeatureKeys(String.join(",", r.getFeatureKeys().stream()
                    .map(String::trim).filter(CATALOG::containsKey).distinct().toList()));
        }
        if (r.getSortOrder() != null)       p.setSortOrder(r.getSortOrder());
        applyFree(p, r);
        if (r.getEnabled() != null) {
            if (!r.getEnabled() && p.isEnabled()) {
                boolean otherEnabled = planRepo.findAll().stream()
                        .anyMatch(x -> !x.getId().equals(p.getId()) && x.isEnabled());
                if (!otherEnabled) {
                    throw new IllegalArgumentException("At least one plan must stay enabled, this is the last visible plan");
                }
            }
            p.setEnabled(r.getEnabled());
        }
        Plan saved = planRepo.save(p);
        keepOnePopular(saved);
        return PlanDto.from(saved);
    }

    // Admin adds a new plan. The code is unique and cannot be changed later; a new plan unlocks no app features until the admin ticks them
    @Transactional
    public PlanDto create(PlanRequest r) {
        String code = r.getCode() == null ? "" : r.getCode().trim().toUpperCase().replace(' ', '_');
        if (!code.matches("^[A-Z][A-Z0-9_]{1,29}$")) {
            throw new IllegalArgumentException(
                    "Plan code must be 2 to 30 characters: letters, numbers or underscores, starting with a letter");
        }
        if (planRepo.findByCode(code).isPresent()) {
            throw new IllegalArgumentException("A plan with the code " + code + " already exists");
        }
        if (r.getName() == null || r.getName().isBlank()) {
            throw new IllegalArgumentException("Enter a name for the plan");
        }

        checkDiscount(r.getPriceMonthly(), r.getDiscountPrice(), "");
        checkDiscount(r.getPriceYearly(), r.getDiscountPriceYearly(), "yearly ");

        int nextOrder = planRepo.findAllByOrderBySortOrderAsc().stream()
                .map(Plan::getSortOrder).filter(java.util.Objects::nonNull)
                .max(Integer::compare).orElse(0) + 1;

        Plan p = Plan.builder()
                .code(code)
                .name(r.getName().trim())
                .tagline(r.getTagline() == null ? null : r.getTagline().trim())
                .priceMonthly(r.getPriceMonthly())
                .discountPrice(r.getDiscountPrice())
                .priceYearly(r.getPriceYearly())
                .discountPriceYearly(r.getDiscountPriceYearly())
                .comingSoon(Boolean.TRUE.equals(r.getComingSoon()))
                .audience(audienceOf(r.getAudience(), Plan.AUDIENCE_ADVOCATE))
                .mostPopular(Boolean.TRUE.equals(r.getMostPopular()))
                .associateLimit(r.getAssociateLimit() == null ? 0 : r.getAssociateLimit())
                .features(r.getFeatures() == null ? "" : String.join("\n", r.getFeatures().stream()
                        .map(String::trim).filter(s -> !s.isEmpty()).toList()))
                .featureKeys(r.getFeatureKeys() == null ? "" : String.join(",", r.getFeatureKeys().stream()
                        .map(String::trim).filter(CATALOG::containsKey).distinct().toList()))
                .sortOrder(r.getSortOrder() == null ? nextOrder : r.getSortOrder())
                .enabled(r.getEnabled() == null || r.getEnabled())
                .build();
        applyFree(p, r);
        Plan saved = planRepo.save(p);
        keepOnePopular(saved);
        return PlanDto.from(saved);
    }

    // Admin removes a plan. Any plan can be removed (Free included) except the last one left. Advocates still on it
    // are moved to moveToCode first; without a plan to move to the removal is refused while accounts are on it.
    // If any of them cannot move (too many associates for the new plan) nothing is changed.
    @Transactional
    public void delete(Long id, String moveToCode) {
        Plan p = planRepo.findById(id).orElseThrow(() -> new NoSuchElementException("Plan not found"));

        if (planRepo.count() <= 1) {
            throw new IllegalArgumentException("This is the last plan left and cannot be removed");
        }

        long advocates = userRepo.countAdvocatesOnPlan(p.getCode(), isDefaultSlot(p.getCode()));
        boolean hasTarget = moveToCode != null && !moveToCode.isBlank();
        if (advocates > 0 && !hasTarget) {
            throw new IllegalArgumentException(
                    advocates + (advocates == 1 ? " account is" : " accounts are") + " still on the " + p.getName()
                            + " plan. Choose a plan to move them to.");
        }
        if (hasTarget) {
            Move m = planMove(p.getCode(), moveToCode);
            if (!m.skipped().isEmpty()) {
                PlanMigrateResult.Skipped first = m.skipped().get(0);
                throw new IllegalArgumentException(m.skipped().size() + " account(s) cannot move to the " + m.to().getName()
                        + " plan, for example " + first.name + " (" + first.reason + "). Choose another plan.");
            }
            m.movable().forEach(u -> u.setPlanCode(m.to().getCode()));
            userRepo.saveAll(m.movable());
        }

        // Anything else still carrying the code (associates) just goes back to having no plan of its own
        List<User> leftovers = userRepo.findByPlanCodeIgnoreCase(p.getCode());
        if (!leftovers.isEmpty()) {
            leftovers.forEach(u -> u.setPlanCode(null));
            userRepo.saveAll(leftovers);
        }
        planRepo.delete(p);
    }

    private void applyFree(Plan p, PlanRequest r) {
        boolean monthly = r.getFreeMonthly() != null ? r.getFreeMonthly() : p.isFreeMonthly();
        boolean yearly = r.getFreeYearly() != null ? r.getFreeYearly() : p.isFreeYearly();
        Integer price = p.getPriceMonthly();
        Integer priceYear = p.getPriceYearly();
        boolean zeroMonthly = price != null && price > 0 && p.getDiscountPrice() != null && p.getDiscountPrice() == 0;
        boolean zeroYearly = priceYear != null && priceYear > 0 && p.getDiscountPriceYearly() != null && p.getDiscountPriceYearly() == 0;
        if (yearly && !zeroYearly && (priceYear == null || priceYear <= 0)) {
            throw new IllegalArgumentException("Enter a yearly price before making the yearly plan free");
        }
        monthly = monthly || zeroMonthly;
        yearly = yearly || zeroYearly;
        // A plan that is free for the year is free by the month as well
        if (yearly) monthly = true;
        if (monthly && price != null && price > 0) p.setDiscountPrice(0);
        if (yearly && priceYear != null && priceYear > 0) p.setDiscountPriceYearly(0);
        p.setFreeMonthly(monthly);
        p.setFreeYearly(yearly);
    }

    // True when the plan exists and is marked coming soon
    @Transactional(readOnly = true)
    public boolean isComingSoon(String code) {
        return code != null && planRepo.findByCode(code.trim().toUpperCase())
                .map(Plan::isComingSoon).orElse(false);
    }

    @Transactional(readOnly = true)
    public boolean isDisabled(String code) {
        return code != null && planRepo.findByCode(code.trim().toUpperCase())
                .map(p -> !p.isEnabled()).orElse(false);
    }

    // True when the plan exists and is for business accounts only (a plan with no audience counts as ADVOCATE)
    @Transactional(readOnly = true)
    public boolean isBusinessOnly(String code) {
        return code != null && planRepo.findByCode(code.trim().toUpperCase())
                .map(p -> Plan.AUDIENCE_BUSINESS.equals(p.getAudience())).orElse(false);
    }

    // True when the plan code exists
    public boolean exists(String code) {
        return code != null && planRepo.findByCode(code.trim().toUpperCase()).isPresent();
    }
}
