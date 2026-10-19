package com.internyay.dto;

import lombok.*;

// One entry of a misc. application's hearing history
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MiscHearingDto {
    public Long id;
    // yyyy-MM-dd
    public String date;
    // Note for the hearing held on that date, null when there is none
    public String note;
}
