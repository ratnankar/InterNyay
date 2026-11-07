package com.internyay.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.internyay.entity.FeeCalculatorConfig;
import com.internyay.repository.FeeCalculatorConfigRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Court fee calculator rules: defaults, saving and the checks on what the admin saves
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FeeCalculatorServiceTest {

    @Mock FeeCalculatorConfigRepository repo;

    private final ObjectMapper mapper = new ObjectMapper();
    private FeeCalculatorService service;

    @BeforeEach
    void setUp() {
        service = new FeeCalculatorService(repo, mapper);
        when(repo.findById(FeeCalculatorConfig.ROW_ID)).thenReturn(Optional.empty());
    }

    // The built-in rules are a valid rule set, so they are the easiest source of a correct document to modify
    private ObjectNode validRules() {
        return service.current().deepCopy();
    }

    private void assertRefused(ObjectNode rules, String messagePart) {
        assertThatThrownBy(() -> service.save(rules))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(messagePart);
        verify(repo, never()).save(any());
    }

    @Test
    void servesTheBuiltInDefaultsWhenNothingIsSaved() {
        JsonNode rules = service.current();

        assertThat(rules.get("caseTypes")).isNotNull().isNotEmpty();
        assertThat(rules.get("scales").has("adValorem")).isTrue();
    }

    @Test
    void servesTheSavedRulesWhenTheyExist() {
        FeeCalculatorConfig row = FeeCalculatorConfig.builder()
                .id(FeeCalculatorConfig.ROW_ID).config("{\"saved\":true}").build();
        when(repo.findById(FeeCalculatorConfig.ROW_ID)).thenReturn(Optional.of(row));

        assertThat(service.current().get("saved").asBoolean()).isTrue();
    }

    @Test
    void fallsBackToDefaultsWhenTheSavedJsonIsBroken() {
        FeeCalculatorConfig row = FeeCalculatorConfig.builder()
                .id(FeeCalculatorConfig.ROW_ID).config("{not json").build();
        when(repo.findById(FeeCalculatorConfig.ROW_ID)).thenReturn(Optional.of(row));

        assertThat(service.current().get("caseTypes")).isNotEmpty();
    }

    @Test
    void seedDefaultsSavesTheDefaultsOnAnEmptyTable() {
        when(repo.existsById(FeeCalculatorConfig.ROW_ID)).thenReturn(false);

        service.seedDefaults();

        ArgumentCaptor<FeeCalculatorConfig> saved = ArgumentCaptor.forClass(FeeCalculatorConfig.class);
        verify(repo).save(saved.capture());
        assertThat(saved.getValue().getId()).isEqualTo(FeeCalculatorConfig.ROW_ID);
        assertThat(saved.getValue().getUpdatedAt()).isNotNull();
    }

    @Test
    void seedDefaultsNeverOverwritesRulesTheAdminSaved() {
        when(repo.existsById(FeeCalculatorConfig.ROW_ID)).thenReturn(true);

        service.seedDefaults();

        verify(repo, never()).save(any());
    }

    @Test
    void validRulesAreSavedAndReturned() {
        ObjectNode rules = validRules();

        JsonNode result = service.save(rules);

        assertThat(result).isEqualTo(rules);
        verify(repo).save(any(FeeCalculatorConfig.class));
    }

    @Test
    void resetSavesTheDefaults() {
        JsonNode result = service.reset();

        assertThat(result.get("caseTypes")).isNotEmpty();
        verify(repo).save(any(FeeCalculatorConfig.class));
    }

    @Test
    void refusesMissingOrEmptyRules() {
        assertThatThrownBy(() -> service.save(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.save(mapper.createObjectNode()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("fee for every case type");
    }

    @Test
    void refusesADuplicateCaseType() {
        ObjectNode rules = validRules();
        ArrayNode caseTypes = (ArrayNode) rules.get("caseTypes");
        caseTypes.add(caseTypes.get(0).deepCopy());

        assertRefused(rules, "Duplicate case type");
    }

    @Test
    void refusesAnUnknownCaseType() {
        ObjectNode rules = validRules();
        ((ObjectNode) rules.get("caseTypes").get(0)).put("caseType", "tribunal");

        assertRefused(rules, "Unknown case type");
    }

    @Test
    void refusesRulesMissingACaseType() {
        ObjectNode rules = validRules();
        ((ArrayNode) rules.get("caseTypes")).remove(0);

        assertRefused(rules, "Every case type needs a fee");
    }

    @Test
    void refusesAnUnknownFeeType() {
        ObjectNode rules = validRules();
        ((ObjectNode) rules.get("caseTypes").get(0)).put("kind", "mystery");

        assertRefused(rules, "Unknown fee type");
    }

    @Test
    void refusesACaseTypeFeeWithoutAName() {
        ObjectNode rules = validRules();
        ((ObjectNode) rules.get("caseTypes").get(0)).put("label", "");

        assertRefused(rules, "needs a name");
    }

    @Test
    void refusesANegativeFixedFee() {
        ObjectNode rules = validRules();
        ObjectNode rule = (ObjectNode) rules.get("caseTypes").get(0);
        rule.put("kind", "fixed");
        rule.put("amount", -5);

        assertRefused(rules, "fixed fee of 0 or more");
    }

    @Test
    void refusesAMultiplierOfZero() {
        ObjectNode rules = validRules();
        ((ObjectNode) rules.get("caseTypes").get(0)).put("mult", 0);

        assertRefused(rules, "multiplier");
    }

    @Test
    void refusesMissingScales() {
        ObjectNode rules = validRules();
        rules.remove("scales");

        assertRefused(rules, "Fee scales are missing");
    }

    @Test
    void refusesALastBandWithAnUpperLimit() {
        ObjectNode rules = validRules();
        ArrayNode slabs = (ArrayNode) rules.get("scales").get("adValorem").get("slabs");
        ((ObjectNode) slabs.get(slabs.size() - 1)).put("upTo", 999_999_999);

        assertRefused(rules, "must have no upper limit");
    }

    @Test
    void refusesNotesThatAreNotAList() {
        ObjectNode rules = validRules();
        rules.put("notes", "text");

        assertRefused(rules, "Notes must be a list");
    }

    // ---- State ad valorem tables (Delhi & Chandigarh, Haryana, Uttar Pradesh & Uttarakhand)

    // Fee of the first band of a scale whose upper limit is not below the value, for a flat-fee State table
    private double tableFee(JsonNode rules, String scale, double value) {
        for (JsonNode band : rules.get("scales").get(scale).get("slabs")) {
            if (band.get("upTo").isNull() || value <= band.get("upTo").asDouble()) return band.get("base").asDouble();
        }
        throw new AssertionError("no band");
    }

    @Test
    void defaultsHaveTheThreeStateTablesAndStates() {
        JsonNode rules = service.current();

        assertThat(rules.get("jurisdictions")).hasSize(4);
        assertThat(rules.get("jurisdictions").get(0).get("key").asText()).isEqualTo("delhi");
        assertThat(rules.get("jurisdictions").get(0).get("scale").asText()).isEqualTo("adValoremDelhi");
        for (String scale : new String[]{"adValoremDelhi", "adValoremHaryana", "adValoremUP"}) {
            ArrayNode slabs = (ArrayNode) rules.get("scales").get(scale).get("slabs");
            assertThat(slabs.size()).isGreaterThan(200);
            assertThat(slabs.get(slabs.size() - 1).get("upTo").isNull()).isTrue();
            assertThat(rules.get("scales").get(scale).has("maxFee")).isFalse();
        }
        // The Central Act scale keeps its cap
        assertThat(rules.get("scales").get("adValorem").get("maxFee").asInt()).isEqualTo(3000);
    }

    @Test
    void stateTablesHoldTheFeesOfTheSourceTables() {
        JsonNode rules = service.current();

        assertThat(tableFee(rules, "adValoremDelhi", 5)).isEqualTo(0.5);
        assertThat(tableFee(rules, "adValoremDelhi", 510)).isEqualTo(76.5);
        assertThat(tableFee(rules, "adValoremDelhi", 100_000)).isEqualTo(3320.0);
        assertThat(tableFee(rules, "adValoremDelhi", 400_000)).isEqualTo(6248.0);
        assertThat(tableFee(rules, "adValoremHaryana", 100_000)).isEqualTo(5300.0);
        assertThat(tableFee(rules, "adValoremHaryana", 7_500_000)).isEqualTo(206_300.0);
        assertThat(tableFee(rules, "adValoremUP", 30_000)).isEqualTo(2657.5);
        // The two rows the source prints irregularly use the value the table's own series gives
        assertThat(tableFee(rules, "adValoremDelhi", 215_000)).isEqualTo(4442.4);
        assertThat(tableFee(rules, "adValoremUP", 23_500)).isEqualTo(2170.0);
        // Above the last row the fee grows by a fixed amount per block
        JsonNode delhiTail = rules.get("scales").get("adValoremDelhi").get("slabs").get(rules.get("scales").get("adValoremDelhi").get("slabs").size() - 1);
        assertThat(delhiTail.get("stepSize").asInt()).isEqualTo(5000);
        assertThat(delhiTail.get("stepFee").asDouble()).isEqualTo(48.8);
    }

    @Test
    void seedDefaultsAddsTheStatesToRulesSavedBeforeTheyExisted() throws Exception {
        ObjectNode legacy = service.current().deepCopy();
        legacy.remove("jurisdictions");
        ObjectNode scales = (ObjectNode) legacy.get("scales");
        scales.remove("adValoremDelhi");
        scales.remove("adValoremHaryana");
        scales.remove("adValoremUP");
        ((ObjectNode) scales.get("adValorem")).put("maxFee", 2500);   // an admin edit that must survive
        ArrayNode notes = mapper.createArrayNode();
        notes.add("Rates are those of the Court Fees Act, 1870: Schedule I (ad valorem) and Schedule II (fixed fees).");
        notes.add("The ad valorem fee on a plaint or memorandum of appeal is capped at 3,000.");
        notes.add("The Act says rates in each State / Union Territory are as per its own State Amendments.");
        notes.add("A note the admin wrote.");
        legacy.set("notes", notes);
        ArrayNode quick = mapper.createArrayNode();
        quick.add(mapper.readTree("{\"label\":\"Civil suit (10 lakh, max)\",\"mode\":\"adv\",\"value\":1000000}"));
        legacy.set("quickRef", quick);
        FeeCalculatorConfig row = FeeCalculatorConfig.builder().id(FeeCalculatorConfig.ROW_ID).config(legacy.toString()).build();
        when(repo.existsById(FeeCalculatorConfig.ROW_ID)).thenReturn(true);
        when(repo.findById(FeeCalculatorConfig.ROW_ID)).thenReturn(Optional.of(row));

        service.seedDefaults();

        verify(repo).save(row);
        JsonNode upgraded = mapper.readTree(row.getConfig());
        assertThat(upgraded.get("jurisdictions")).hasSize(4);
        assertThat(upgraded.get("scales").has("adValoremDelhi")).isTrue();
        assertThat(upgraded.get("scales").get("adValorem").get("maxFee").asInt()).isEqualTo(2500);
        assertThat(upgraded.get("notes").toString()).contains("A note the admin wrote.").doesNotContain("is capped at 3,000");
        assertThat(upgraded.get("notes").get(0).asText()).startsWith("Ad valorem fees (plaints, appeals and reviews)");
        assertThat(upgraded.get("quickRef").toString()).doesNotContain("lakh, max");
        assertThat(upgraded.get("caseTypes")).hasSameSizeAs(legacy.get("caseTypes"));
    }

    private JsonNode ruleOf(JsonNode rules, String caseType) {
        for (JsonNode rule : rules.get("caseTypes")) if (caseType.equals(rule.get("caseType").asText())) return rule;
        throw new AssertionError("no rule for " + caseType);
    }

    @Test
    void defaultsHaveOneFeePerCaseTypeAndNoFilings() {
        JsonNode rules = service.current();

        assertThat(rules.has("filings")).isFalse();
        assertThat(rules.get("caseTypes")).hasSize(7);
        for (JsonNode rule : rules.get("caseTypes")) assertThat(rule.has("key")).isFalse();
    }

    @Test
    void seedDefaultsTurnsSavedFilingsIntoOneFeePerCaseType() throws Exception {
        ObjectNode legacy = service.current().deepCopy();
        legacy.remove("caseTypes");
        ArrayNode filings = mapper.createArrayNode();
        filings.add(mapper.readTree("{\"caseType\":\"civil\",\"key\":\"injunction\",\"label\":\"Injunction\",\"kind\":\"adv\"}"));
        filings.add(mapper.readTree("{\"caseType\":\"civil\",\"key\":\"suit\",\"label\":\"Money suit edited\",\"kind\":\"adv\",\"valueLabel\":\"Amount\"}"));
        filings.add(mapper.readTree("{\"caseType\":\"writ\",\"key\":\"hc_other\",\"label\":\"Other HC petition\",\"kind\":\"fixed\",\"amount\":7}"));
        legacy.set("filings", filings);
        ArrayNode quick = mapper.createArrayNode();
        quick.add(mapper.readTree("{\"label\":\"Declaration\",\"mode\":\"filing\",\"caseType\":\"civil\",\"key\":\"declaration\"}"));
        quick.add(mapper.readTree("{\"label\":\"Consumer\",\"mode\":\"filing\",\"caseType\":\"consumer\",\"key\":\"complaint\",\"value\":500000}"));
        quick.add(mapper.readTree("{\"label\":\"Civil\",\"mode\":\"adv\",\"value\":100000}"));
        legacy.set("quickRef", quick);
        FeeCalculatorConfig row = FeeCalculatorConfig.builder().id(FeeCalculatorConfig.ROW_ID).config(legacy.toString()).build();
        when(repo.existsById(FeeCalculatorConfig.ROW_ID)).thenReturn(true);
        when(repo.findById(FeeCalculatorConfig.ROW_ID)).thenReturn(Optional.of(row));

        service.seedDefaults();

        verify(repo).save(row);
        JsonNode migrated = mapper.readTree(row.getConfig());
        assertThat(migrated.has("filings")).isFalse();
        assertThat(migrated.get("caseTypes")).hasSize(7);
        JsonNode civil = ruleOf(migrated, "civil");
        assertThat(civil.get("label").asText()).isEqualTo("Money suit edited");
        assertThat(civil.has("key")).isFalse();
        assertThat(ruleOf(migrated, "writ").get("amount").asInt()).isEqualTo(7);
        assertThat(ruleOf(migrated, "consumer").get("kind").asText()).isEqualTo("scale");
        assertThat(migrated.get("quickRef")).hasSize(2);
        assertThat(migrated.get("quickRef").get(0).get("mode").asText()).isEqualTo("caseType");
        assertThat(migrated.get("quickRef").get(0).has("key")).isFalse();
        assertThat(migrated.get("quickRef").get(1).get("mode").asText()).isEqualTo("adv");
    }

    @Test
    void seedDefaultsLeavesRulesThatAlreadyHaveStatesAlone() {
        FeeCalculatorConfig row = FeeCalculatorConfig.builder().id(FeeCalculatorConfig.ROW_ID).config(service.current().toString()).build();
        when(repo.existsById(FeeCalculatorConfig.ROW_ID)).thenReturn(true);
        when(repo.findById(FeeCalculatorConfig.ROW_ID)).thenReturn(Optional.of(row));

        service.seedDefaults();

        verify(repo, never()).save(any());
    }

    @Test
    void refusesNoStates() {
        ObjectNode rules = validRules();
        rules.set("jurisdictions", mapper.createArrayNode());

        assertRefused(rules, "at least one State");
    }

    @Test
    void refusesAStateWithoutAName() {
        ObjectNode rules = validRules();
        ((ObjectNode) rules.get("jurisdictions").get(0)).put("label", " ");

        assertRefused(rules, "Every State needs a name");
    }

    @Test
    void refusesADuplicateStateKey() {
        ObjectNode rules = validRules();
        ((ArrayNode) rules.get("jurisdictions")).add(rules.get("jurisdictions").get(0).deepCopy());

        assertRefused(rules, "Duplicate State key");
    }

    @Test
    void refusesAStateWithAScaleThatIsNotAdValorem() {
        ObjectNode rules = validRules();
        ((ObjectNode) rules.get("jurisdictions").get(0)).put("scale", "consumer");

        assertRefused(rules, "ad valorem fee scale");
    }
}
