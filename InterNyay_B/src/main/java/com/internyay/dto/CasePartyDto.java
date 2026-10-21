package com.internyay.dto;

import com.internyay.entity.CaseNonClient;
import com.internyay.entity.CaseOpponent;
import com.internyay.entity.CaseParty;
import lombok.*;

// An opposite party, or a non-client party on our side, sent with a case
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CasePartyDto {

    public Long id;
    public String name;
    public String fatherName;
    public String address;
    public String phone;

    // Role in the case, set only for non-client parties
    public String subType;

    public static CasePartyDto from(CaseOpponent p) {
        return base(p).build();
    }

    public static CasePartyDto from(CaseNonClient p) {
        return base(p).subType(p.getSubType()).build();
    }

    private static CasePartyDtoBuilder base(CaseParty p) {
        return CasePartyDto.builder()
                .id(p.getId())
                .name(p.getName())
                .fatherName(p.getFatherName())
                .address(p.getAddress())
                .phone(p.getPhone());
    }
}
