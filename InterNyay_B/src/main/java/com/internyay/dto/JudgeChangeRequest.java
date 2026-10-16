package com.internyay.dto;

import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;

// Used by the admin to change the judge of a listing (court seat)
@Data
public class JudgeChangeRequest {

    // True = the court has no judge from the effective date (vacant) until a judge is put in it. No judge is chosen then
    private boolean vacant;

    // Existing judge (judge profile id). Empty = a new judge typed in below
    private Long judgeId;

    // New judge only
    private String name;

    // New judge only, as base64 text. Empty = no photo
    private String photo;

    // Day the judge starts in this listing. Empty = today. The judge who sat there stays in the history up to the day before
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate effectiveFrom;

    // What happens to the court the incoming judge is leaving, when the judge sits in another listing:
    // KEEP_BOTH (default) = the judge holds both courts, SWAP = the judge being replaced takes that court,
    // REPLACE = another judge (replacementJudgeId) takes that court
    private String leavingPlan;

    // The listing the incoming judge is leaving. Required for SWAP and REPLACE
    private Long fromListingId;

    // Judge who takes the court the incoming judge leaves. Required for REPLACE
    private Long replacementJudgeId;
}
