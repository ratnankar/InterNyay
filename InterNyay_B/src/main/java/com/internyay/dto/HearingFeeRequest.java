package com.internyay.dto;

import lombok.Data;

// Hearing fee row sent when a case is saved, date and amounts come as text
@Data
public class HearingFeeRequest {
    public String date;
    public String amount;
    public String amountReceived;
    public Boolean paid;
}
