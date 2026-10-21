package com.internyay.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotNull;

// Preferences saved from the Calendar app. data must be a JSON object
public record AppPreferenceRequest(@NotNull JsonNode data, @NotNull Long updatedAt) {
}
