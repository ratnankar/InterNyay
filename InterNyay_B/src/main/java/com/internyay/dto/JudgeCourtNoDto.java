package com.internyay.dto;

// Court room number with the judge sitting there. Building and floor tell apart rooms that share a number
// (null when the listing has none)
public record JudgeCourtNoDto(String courtRoomNo, String judgeName, String building, String floor) {
}
