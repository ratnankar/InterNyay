package com.internyay.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record ChatFeedbackRequest(@Min(-1) @Max(1) int rating, @Size(max = 500) String note) {}
