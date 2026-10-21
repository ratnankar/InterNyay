package com.internyay.dto;

import com.fasterxml.jackson.databind.JsonNode;

// Preferences as sent to the app. data is null and updatedAt 0 when nothing has been saved yet
public record AppPreferenceDto(JsonNode data, long updatedAt) {
}
