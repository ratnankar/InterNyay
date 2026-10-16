package com.internyay.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

// Stage fee row sent when a case is saved, amount comes as text
@Data
public class StageFeeRequest {
    @Size(max = 255) public String name;
    public String amount;
    public Boolean paid;
}
