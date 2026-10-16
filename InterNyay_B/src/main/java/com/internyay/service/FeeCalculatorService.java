package com.internyay.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.internyay.entity.FeeCalculatorConfig;
import com.internyay.repository.FeeCalculatorConfigRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.Set;

// Court fee calculator rules kept by the admin
@Slf4j
@Service
@RequiredArgsConstructor
public class FeeCalculatorService {

    private static final Set<String> KINDS = Set.of("adv", "half", "fixed", "scale");
    private static final Set<String> SCALES = Set.of("adValorem", "consumer", "probate", "succession");
    private static final int MAX_FILINGS = 500;

    private final FeeCalculatorConfigRepository repo;
    private final ObjectMapper mapper;

    // Built-in Court Fees Act, 1870 rules, kept in src/main/resources/fee-calculator-defaults.json
    private JsonNode defaults() {
        try (InputStream in = new ClassPathResource("fee-calculator-defaults.json").getInputStream()) {
            return mapper.readTree(in);
        } catch (Exception e) {
            throw new IllegalStateException("Could not read the default fee calculator rules", e);
        }
    }

    // Puts the default rules in the table when it is empty (a new or dropped database), so nothing has to be seeded by hand.
    // Rules the admin already saved are never touched.
    @EventListener(ApplicationReadyEvent.class)
    public void seedDefaults() {
        try {
            if (repo.existsById(FeeCalculatorConfig.ROW_ID)) return;
            save(defaults());
            log.info("Fee calculator: default rules saved to the database");
        } catch (Exception e) {
            log.warn("Fee calculator: could not save the default rules ({}). The defaults are served until the table exists.", e.getMessage());
        }
    }

    // The saved rules (the defaults if the row is missing)
    @Transactional(readOnly = true)
    public JsonNode current() {
        return repo.findById(FeeCalculatorConfig.ROW_ID).map(r -> {
            try { return mapper.readTree(r.getConfig()); } catch (Exception e) { return defaults(); }
        }).orElseGet(this::defaults);
    }

    // Checks the rules and saves them
    @Transactional
    public JsonNode save(JsonNode cfg) {
        validate(cfg);
        FeeCalculatorConfig row = repo.findById(FeeCalculatorConfig.ROW_ID)
                .orElseGet(() -> FeeCalculatorConfig.builder().id(FeeCalculatorConfig.ROW_ID).build());
        row.setConfig(cfg.toString());
        row.setUpdatedAt(LocalDateTime.now());
        repo.save(row);
        return cfg;
    }

    // Replaces the saved rules with the built-in defaults
    @Transactional
    public JsonNode reset() {
        return save(defaults());
    }

    // Refuses rules the calculator could not use
    private void validate(JsonNode c) {
        if (c == null || !c.isObject()) throw new IllegalArgumentException("Fee rules are missing");
        JsonNode filings = c.get("filings");
        if (filings == null || !filings.isArray() || filings.isEmpty()) throw new IllegalArgumentException("Add at least one filing");
        if (filings.size() > MAX_FILINGS) throw new IllegalArgumentException("Too many filings");
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (JsonNode f : filings) {
            String type = text(f, "caseType"), key = text(f, "key"), label = text(f, "label"), kind = text(f, "kind");
            if (type.isEmpty() || key.isEmpty()) throw new IllegalArgumentException("Every filing needs a case type and a key");
            if (label.isEmpty()) throw new IllegalArgumentException("Every filing needs a name");
            if (!seen.add(type + "/" + key)) throw new IllegalArgumentException("Duplicate filing key '" + key + "' under " + type);
            if (!KINDS.contains(kind)) throw new IllegalArgumentException("Unknown fee type for '" + label + "'");
            if ("fixed".equals(kind) && !(f.path("amount").isNumber() && f.get("amount").asDouble() >= 0))
                throw new IllegalArgumentException("'" + label + "' needs a fixed fee of 0 or more");
            if ("scale".equals(kind) && !SCALES.contains(text(f, "scale")))
                throw new IllegalArgumentException("'" + label + "' needs a fee scale");
            if (f.hasNonNull("mult") && !(f.get("mult").isNumber() && f.get("mult").asDouble() > 0))
                throw new IllegalArgumentException("The multiplier of '" + label + "' must be above 0");
        }
        JsonNode scales = c.get("scales");
        if (scales == null || !scales.isObject()) throw new IllegalArgumentException("Fee scales are missing");
        for (String s : SCALES) {
            JsonNode slabs = scales.path(s).path("slabs");
            if (!slabs.isArray() || slabs.isEmpty()) throw new IllegalArgumentException("The " + s + " scale needs at least one band");
            double prev = 0;
            for (int i = 0; i < slabs.size(); i++) {
                JsonNode b = slabs.get(i);
                boolean last = i == slabs.size() - 1;
                if (b.hasNonNull("upTo")) {
                    double up = b.get("upTo").asDouble();
                    if (!b.get("upTo").isNumber() || up <= prev) throw new IllegalArgumentException("Bands of the " + s + " scale must go up in value");
                    prev = up;
                } else if (!last) {
                    throw new IllegalArgumentException("Only the last band of the " + s + " scale can have no upper limit");
                }
                if (!last && !b.hasNonNull("upTo")) throw new IllegalArgumentException("Bands of the " + s + " scale must go up in value");
                for (String n : new String[]{"base", "stepSize", "stepFee", "percent"})
                    if (b.hasNonNull(n) && !(b.get(n).isNumber() && b.get(n).asDouble() >= 0))
                        throw new IllegalArgumentException("Band values in the " + s + " scale must be numbers of 0 or more");
            }
            if (slabs.get(slabs.size() - 1).hasNonNull("upTo")) throw new IllegalArgumentException("The last band of the " + s + " scale must have no upper limit");
        }
        JsonNode forums = c.get("forums");
        if (forums != null && !forums.isNull() && !forums.isArray()) throw new IllegalArgumentException("Forums must be a list");
        JsonNode quick = c.get("quickRef");
        if (quick != null && !quick.isNull()) {
            if (!quick.isArray()) throw new IllegalArgumentException("Quick reference must be a list");
            for (JsonNode r : quick) {
                if (text(r, "label").isEmpty()) throw new IllegalArgumentException("Every quick reference row needs a label");
                String mode = text(r, "mode");
                if (!mode.equals("adv") && !mode.equals("filing")) throw new IllegalArgumentException("Unknown quick reference type");
                if (mode.equals("filing") && (text(r, "caseType").isEmpty() || text(r, "key").isEmpty()))
                    throw new IllegalArgumentException("Pick a filing for each quick reference row");
                if (r.hasNonNull("value") && !(r.get("value").isNumber() && r.get("value").asDouble() >= 0))
                    throw new IllegalArgumentException("Quick reference values must be numbers of 0 or more");
            }
        }
        JsonNode notes = c.get("notes");
        if (notes != null && !notes.isNull() && !notes.isArray()) throw new IllegalArgumentException("Notes must be a list");
    }

    private static String text(JsonNode n, String f) { return n.path(f).asText("").trim(); }
}
