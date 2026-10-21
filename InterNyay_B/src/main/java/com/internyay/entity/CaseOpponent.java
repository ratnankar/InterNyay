package com.internyay.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

// One opposite party of a case. A case can have several
@Entity
@Table(name = "case_opposing_parties")
@Getter @Setter @NoArgsConstructor
public class CaseOpponent extends CaseParty {

    // Case this party is on the other side of
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "case_id", nullable = false)
    private Case legalCase;
}
