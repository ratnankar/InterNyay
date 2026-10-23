package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;

public record CauseListRelayAnswer(@NotBlank String captcha) {
}
