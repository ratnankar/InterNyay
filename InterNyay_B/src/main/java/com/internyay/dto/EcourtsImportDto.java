package com.internyay.dto;

import com.fasterxml.jackson.databind.JsonNode;

// The saved import list as sent to the app. items is null and updatedAt 0 when nothing has been imported
public record EcourtsImportDto(JsonNode items, long updatedAt) {
}
