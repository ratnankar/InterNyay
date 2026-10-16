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

        assertThat(rules.get("filings")).isNotNull().isNotEmpty();
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

        assertThat(service.current().get("filings")).isNotEmpty();
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

        assertThat(result.get("filings")).isNotEmpty();
        verify(repo).save(any(FeeCalculatorConfig.class));
    }

    @Test
    void refusesMissingOrEmptyRules() {
        assertThatThrownBy(() -> service.save(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.save(mapper.createObjectNode()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("at least one filing");
    }

    @Test
    void refusesADuplicateFilingKey() {
        ObjectNode rules = validRules();
        ArrayNode filings = (ArrayNode) rules.get("filings");
        filings.add(filings.get(0).deepCopy());

        assertRefused(rules, "Duplicate filing key");
    }

    @Test
    void refusesAnUnknownFeeType() {
        ObjectNode rules = validRules();
        ((ObjectNode) rules.get("filings").get(0)).put("kind", "mystery");

        assertRefused(rules, "Unknown fee type");
    }

    @Test
    void refusesAFilingWithoutAName() {
        ObjectNode rules = validRules();
        ((ObjectNode) rules.get("filings").get(0)).put("label", "");

        assertRefused(rules, "needs a name");
    }

    @Test
    void refusesANegativeFixedFee() {
        ObjectNode rules = validRules();
        ObjectNode filing = (ObjectNode) rules.get("filings").get(0);
        filing.put("kind", "fixed");
        filing.put("amount", -5);

        assertRefused(rules, "fixed fee of 0 or more");
    }

    @Test
    void refusesAMultiplierOfZero() {
        ObjectNode rules = validRules();
        ((ObjectNode) rules.get("filings").get(0)).put("mult", 0);

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
}
