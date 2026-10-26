package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;

// The CAPTCHA the advocate typed for a case lookup by CNR
public record CnrAnswer(@NotBlank String captcha) {
}
