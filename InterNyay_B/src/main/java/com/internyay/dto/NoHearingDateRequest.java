package com.internyay.dto;

import lombok.*;

import java.time.LocalDate;

// Date the user wants to mark as having no hearing
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class NoHearingDateRequest {
    private LocalDate date;
}
