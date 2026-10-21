package com.internyay.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

// A person on our side of a case who is not saved as a client. They can be marked as a client later: the client is
// created and linked to the case, and this row is removed
@Entity
@Table(name = "case_non_clients")
@Getter @Setter @NoArgsConstructor
public class CaseNonClient extends CaseParty {

    // Role in the case (Accused, Complainant, ...), set from the side our client is on
    @Column(length = 40)
    private String subType;

    // Case this person is a party of
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "case_id", nullable = false)
    private Case legalCase;
}
