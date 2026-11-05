package com.internyay.dto;

// Admin renames a court, a district, a building or a floor of the court table.
// level: court | district | building | floor. The other fields say which one (the place it sits in and its current name);
// newName is the new spelling. An empty district / building means "no district" / "no building".
public record CourtRenameRequest(String level, String court, String district, String building, String floor, String newName) {
}
