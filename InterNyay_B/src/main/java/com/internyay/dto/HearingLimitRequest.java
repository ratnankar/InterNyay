package com.internyay.dto;

import lombok.*;

// A daily hearing limit, empty means no limit. For one date, 0 makes it a no-hearing date
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class HearingLimitRequest {
    private Integer limit;
}
