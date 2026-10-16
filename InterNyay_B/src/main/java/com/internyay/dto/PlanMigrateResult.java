package com.internyay.dto;

import lombok.*;

import java.util.List;

// What a bulk plan move did (or would do when it was a dry run)
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class PlanMigrateResult {
    public String fromCode;
    public String toCode;
    // True when nothing was saved, this is only a preview
    public boolean dryRun;
    // Advocate accounts found on the source plan
    public int total;
    // Accounts moved (or that can be moved, for a dry run)
    public int moved;
    // Accounts left where they are, with the reason
    public List<Skipped> skipped;

    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class Skipped {
        public Long id;
        public String name;
        public String email;
        public String reason;
    }
}
