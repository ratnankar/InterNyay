package com.internyay.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record FileNumberExchangeRequest(@NotNull @Min(1) Integer fileSeq) {
}
