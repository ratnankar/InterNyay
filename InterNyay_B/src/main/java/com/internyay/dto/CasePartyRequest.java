package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

// One opposite party, or one non-client party on our side, as sent with a case
@Data
public class CasePartyRequest {

    @NotBlank @Size(max = 255) public String name;
    @Size(max = 255) public String fatherName;
    @Size(max = 500) public String address;
    @Size(max = 30)  public String phone;

    // Role in the case, used only for non-client parties (Accused, Complainant, ...)
    @Size(max = 40)  public String subType;
}
