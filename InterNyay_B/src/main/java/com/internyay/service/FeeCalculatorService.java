package com.internyay.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

// Court fee calculator rules kept by the admin
@Slf4j
@Service
@RequiredArgsConstructor
public class FeeCalculatorService {

    private static final Set<String> KINDS = Set.of("adv", "half", "fixed", "scale");
    // adValorem is the Central Act scale; the adValorem* ones are the State tables (Delhi & Chandigarh, Haryana, Uttar Pradesh & Uttarakhand)
    private static final Set<String> SCALES = Set.of("adValorem", "adValoremDelhi", "adValoremHaryana", "adValoremUP", "consumer", "probate", "succession");
    private static final List<String> CASE_TYPES = List.of("civil", "criminal", "family", "labour", "consumer", "writ", "appeal");
    private static final Map<String, String> LEGACY_PRIMARY_FILINGS = Map.of(
            "civil", "suit", "appeal", "decree", "criminal", "app_dist", "family", "hma",
            "writ", "writ", "consumer", "complaint", "labour", "claim");
    private static final int MAX_BANDS = 1000;

    // Notes the admin may have saved unchanged from the first built-in rules; they are replaced by the State notes (see upgraded)
    private static final List<String> LEGACY_NOTE_STARTS = List.of(
            "Rates are those of the Court Fees Act, 1870",
            "The ad valorem fee on a plaint or memorandum of appeal is capped",
            "The Act says rates in each State");

    private final FeeCalculatorConfigRepository repo;
    private final ObjectMapper mapper;

    // The built-in rules, for readers that need a scale the saved rules lack
    public JsonNode defaultRules() {
        return defaults();
    }

    // Built-in Court Fees Act, 1870 rules, kept in src/main/resources/fee-calculator-defaults.json
    private JsonNode defaults() {
        try (InputStream in = new ClassPathResource("fee-calculator-defaults.json").getInputStream()) {
            return mapper.readTree(in);
        } catch (Exception e) {
            throw new IllegalStateException("Could not read the default fee calculator rules", e);
        }
    }

    // Puts the default rules in the table when it is empty (a new or dropped database), so nothing has to be seeded by hand.
    // Rules the admin already saved are never replaced; the ones saved before the State tables existed only gain the States (see upgraded).
    @EventListener(ApplicationReadyEvent.class)
    public void seedDefaults() {
        try {
            if (!repo.existsById(FeeCalculatorConfig.ROW_ID)) {
                save(defaults());
                log.info("Fee calculator: default rules saved to the database");
                return;
            }
            repo.findById(FeeCalculatorConfig.ROW_ID).ifPresent(row -> {
                try {
                    JsonNode saved = mapper.readTree(row.getConfig());
                    JsonNode migrated = migratedToCaseTypes(saved);
                    JsonNode up = upgraded(migrated != null ? migrated : saved);
                    JsonNode result = up != null ? up : migrated;
                    if (result == null) return;
                    save(result);
                    log.info("Fee calculator: saved rules brought up to date");
                } catch (Exception e) {
                    log.warn("Fee calculator: could not update the saved rules ({}). The calculator uses its built-in rules until then.", e.getMessage());
                }
            });
        } catch (Exception e) {
            log.warn("Fee calculator: could not save the default rules ({}). The defaults are served until the table exists.", e.getMessage());
        }
    }

    JsonNode migratedToCaseTypes(JsonNode saved) {
        if (saved == null || !saved.isObject() || saved.has("caseTypes") || !saved.path("filings").isArray()) return null;
        JsonNode def = defaults();
        ObjectNode out = saved.deepCopy();
        out.remove("filings");
        ArrayNode rules = mapper.createArrayNode();
        for (String type : CASE_TYPES) {
            JsonNode chosen = null;
            JsonNode first = null;
            for (JsonNode f : saved.get("filings")) {
                if (!type.equals(text(f, "caseType"))) continue;
                if (first == null) first = f;
                if (text(f, "key").equals(LEGACY_PRIMARY_FILINGS.get(type))) { chosen = f; break; }
            }
            if (chosen == null) chosen = first;
            if (chosen != null) {
                ObjectNode rule = chosen.deepCopy();
                rule.remove("key");
                rules.add(rule);
            } else {
                for (JsonNode d : def.get("caseTypes")) if (type.equals(text(d, "caseType"))) rules.add(d);
            }
        }
        out.set("caseTypes", rules);
        JsonNode quick = saved.get("quickRef");
        if (quick != null && quick.isArray()) {
            ArrayNode rows = mapper.createArrayNode();
            for (JsonNode r : quick) {
                if (!"filing".equals(text(r, "mode"))) { rows.add(r); continue; }
                if (!text(r, "key").equals(LEGACY_PRIMARY_FILINGS.get(text(r, "caseType")))) continue;
                ObjectNode row = r.deepCopy();
                row.put("mode", "caseType");
                row.remove("key");
                rows.add(row);
            }
            out.set("quickRef", rows);
        }
        return out;
    }

    // Rules saved before the State tables existed, with the State scales and States added. Everything else the admin saved is kept.
    // The notes about the Central Act cap and "check the local schedule" and the Quick Reference rows of the first built-in rules are
    // replaced by the new ones only while the admin has not changed them. Returns null when there is nothing to add.
    JsonNode upgraded(JsonNode saved) {
        if (saved == null || !saved.isObject() || saved.has("jurisdictions") || !saved.path("scales").isObject()) return null;
        JsonNode def = defaults();
        ObjectNode out = saved.deepCopy();
        ObjectNode scales = (ObjectNode) out.get("scales");
        def.get("scales").fieldNames().forEachRemaining(n -> { if (!scales.has(n)) scales.set(n, def.get("scales").get(n)); });
        out.set("jurisdictions", def.get("jurisdictions"));

        JsonNode notes = saved.get("notes");
        if (notes != null && notes.isArray()) {
            ArrayNode kept = mapper.createArrayNode();
            for (int i = 0; i < 2 && i < def.path("notes").size(); i++) kept.add(def.get("notes").get(i));
            for (JsonNode n : notes) if (LEGACY_NOTE_STARTS.stream().noneMatch(n.asText("").trim()::startsWith)) kept.add(n);
            out.set("notes", kept);
        }
        JsonNode quick = saved.get("quickRef");
        if (quick != null && quick.isArray()) {
            for (JsonNode r : quick) {
                if (text(r, "label").contains("lakh, max")) { out.set("quickRef", def.get("quickRef")); break; }
            }
        }
        return out;
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
        JsonNode caseTypes = c.get("caseTypes");
        if (caseTypes == null || !caseTypes.isArray() || caseTypes.isEmpty()) throw new IllegalArgumentException("Add a fee for every case type");
        Set<String> seen = new HashSet<>();
        for (JsonNode f : caseTypes) {
            String type = text(f, "caseType"), label = text(f, "label"), kind = text(f, "kind");
            if (!CASE_TYPES.contains(type)) throw new IllegalArgumentException("Unknown case type '" + type + "'");
            if (label.isEmpty()) throw new IllegalArgumentException("Every case type fee needs a name");
            if (!seen.add(type)) throw new IllegalArgumentException("Duplicate case type '" + type + "'");
            if (!KINDS.contains(kind)) throw new IllegalArgumentException("Unknown fee type for '" + label + "'");
            if ("fixed".equals(kind) && !(f.path("amount").isNumber() && f.get("amount").asDouble() >= 0))
                throw new IllegalArgumentException("'" + label + "' needs a fixed fee of 0 or more");
            if ("scale".equals(kind) && !SCALES.contains(text(f, "scale")))
                throw new IllegalArgumentException("'" + label + "' needs a fee scale");
            if (f.hasNonNull("mult") && !(f.get("mult").isNumber() && f.get("mult").asDouble() > 0))
                throw new IllegalArgumentException("The multiplier of '" + label + "' must be above 0");
        }
        if (!seen.containsAll(CASE_TYPES)) throw new IllegalArgumentException("Every case type needs a fee");
        JsonNode scales = c.get("scales");
        if (scales == null || !scales.isObject()) throw new IllegalArgumentException("Fee scales are missing");
        for (String s : SCALES) {
            JsonNode slabs = scales.path(s).path("slabs");
            if (!slabs.isArray() || slabs.isEmpty()) throw new IllegalArgumentException("The " + s + " scale needs at least one band");
            if (slabs.size() > MAX_BANDS) throw new IllegalArgumentException("Too many bands in the " + s + " scale");
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
        JsonNode states = c.get("jurisdictions");
        if (states != null && !states.isNull()) {
            if (!states.isArray() || states.isEmpty()) throw new IllegalArgumentException("Add at least one State");
            Set<String> stateKeys = new HashSet<>();
            for (JsonNode j : states) {
                String key = text(j, "key"), label = text(j, "label"), scale = text(j, "scale");
                if (key.isEmpty() || label.isEmpty()) throw new IllegalArgumentException("Every State needs a name");
                if (!stateKeys.add(key)) throw new IllegalArgumentException("Duplicate State key '" + key + "'");
                if (!scale.startsWith("adValorem") || !SCALES.contains(scale))
                    throw new IllegalArgumentException("'" + label + "' needs an ad valorem fee scale");
                JsonNode stateNotes = j.get("notes");
                if (stateNotes != null && !stateNotes.isNull() && !stateNotes.isArray())
                    throw new IllegalArgumentException("The notes of '" + label + "' must be a list");
            }
        }
        JsonNode forums = c.get("forums");
        if (forums != null && !forums.isNull() && !forums.isArray()) throw new IllegalArgumentException("Forums must be a list");
        JsonNode quick = c.get("quickRef");
        if (quick != null && !quick.isNull()) {
            if (!quick.isArray()) throw new IllegalArgumentException("Quick reference must be a list");
            for (JsonNode r : quick) {
                if (text(r, "label").isEmpty()) throw new IllegalArgumentException("Every quick reference row needs a label");
                String mode = text(r, "mode");
                if (!mode.equals("adv") && !mode.equals("caseType")) throw new IllegalArgumentException("Unknown quick reference type");
                if (mode.equals("caseType") && !CASE_TYPES.contains(text(r, "caseType")))
                    throw new IllegalArgumentException("Pick a case type for each quick reference row");
                if (r.hasNonNull("value") && !(r.get("value").isNumber() && r.get("value").asDouble() >= 0))
                    throw new IllegalArgumentException("Quick reference values must be numbers of 0 or more");
            }
        }
        JsonNode notes = c.get("notes");
        if (notes != null && !notes.isNull() && !notes.isArray()) throw new IllegalArgumentException("Notes must be a list");
    }

    private static String text(JsonNode n, String f) { return n.path(f).asText("").trim(); }
}
