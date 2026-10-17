package com.internyay.dto;

// Admin moves a court no. to another building and/or district of the same court.
// An empty district means "no district yet", an empty building means "no building".
// correction = the old place was entered wrongly, so a judge sitting there is moved without keeping the old place in the history
public record CourtMoveRequest(String district, String building, boolean correction) {
}
