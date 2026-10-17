package com.internyay.dto;

import lombok.*;

import java.time.LocalDate;
import java.util.Map;

// The usual daily hearing limit (null = no limit) and the limits set for particular dates
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class HearingLimitsDto {
    private Integer defaultLimit;
    private Map<LocalDate, Integer> overrides;
}
