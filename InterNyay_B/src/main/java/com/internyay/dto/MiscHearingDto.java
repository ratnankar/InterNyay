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

    // Only for an application read from eCourts: the order of that date (an order saved in the app, or one that eCourts lists
    // and can be downloaded with \"Get order\")
    public String orderDocId;
    public String orderDocName;
    public boolean orderOnEcourts;
    public boolean orderDue;
    public boolean noOrderOnRecord;
}
