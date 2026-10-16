package com.internyay.dto;

import com.internyay.entity.BailRosterEntry;
import com.internyay.entity.Judge;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

// Bail roster row with the judges already resolved for the frontend
@Getter @Builder
public class BailRosterDto {

    private Long id;
    private String court;
    private String district;

    // Judges linked from the Judges List
    private List<JudgeRefDto> judicialOfficers;

    // Plain text names saved with the entry
    private String judicialOfficersText;

    private String policeStationAgencies;

    // Judges shown as quick links
    private JudgeRefDto linkOneJudge;
    private JudgeRefDto linkTwoJudge;

    private LocalDate issuedOn;
    private LocalDate fromDate;
    private LocalDate tillDate;
    // True when the roster runs until a further order
    private boolean furtherOrder;

    // Builds the DTO, judges is a lookup of id -> judge
    public static BailRosterDto from(BailRosterEntry b, Map<Long, Judge> judges) {
        List<JudgeRefDto> officers = new ArrayList<>();
        for (Long id : idsOf(b.getJudicialOfficerIds())) {
            Judge j = judges.get(id);
            if (j != null) officers.add(JudgeRefDto.from(j));
        }

        return BailRosterDto.builder()
                .id(b.getId())
                .court(b.getCourt())
                .district(b.getDistrict())
                .judicialOfficers(officers)
                .judicialOfficersText(b.getJudicialOfficers())
                .policeStationAgencies(b.getPoliceStationAgencies())
                .linkOneJudge(b.getLinkOneJudgeId() == null ? null : JudgeRefDto.from(judges.get(b.getLinkOneJudgeId())))
                .linkTwoJudge(b.getLinkTwoJudgeId() == null ? null : JudgeRefDto.from(judges.get(b.getLinkTwoJudgeId())))
                .issuedOn(b.getIssuedOn())
                .fromDate(b.getFromDate())
                .tillDate(b.getTillDate())
                .furtherOrder(Boolean.TRUE.equals(b.getFurtherOrder()))
                .build();
    }

    // Reads ids from a comma separated string, bad values are skipped
    public static List<Long> idsOf(String csv) {
        List<Long> out = new ArrayList<>();
        if (csv == null || csv.isBlank()) return out;

        for (String token : csv.split(",")) {
            String t = token.trim();
            if (t.isEmpty()) continue;
            try {
                out.add(Long.parseLong(t));
            } catch (NumberFormatException ignored) {
            }
        }
        return out;
    }
}
