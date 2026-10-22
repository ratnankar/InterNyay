package com.internyay.dto;

// Admin marks a whole court as a Juvenile Justice Board, or clears the mark
public record JuvenileJusticeBoardRequest(String court, boolean juvenileJusticeBoard) {
}
