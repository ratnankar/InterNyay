package com.internyay.dto;

// Where a judge sits (no photo): id is the listing, profileId the judge. Used to find the courts each judge holds
public record JudgeSeatDto(Long id, Long profileId, String name, String court, String district, String building, String floor, String courtRoomNo) {
}
