package com.internyay.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotNull;

// The import list to keep. items must be a JSON array of cases, each with a 16 character CNR
public record EcourtsImportRequest(@NotNull JsonNode items, @NotNull Long updatedAt) {
}
