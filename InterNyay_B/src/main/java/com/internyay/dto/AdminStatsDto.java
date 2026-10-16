package com.internyay.dto;

import lombok.*;

import java.util.List;
import java.util.Map;

// Numbers shown on the admin dashboard
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class AdminStatsDto {

    // Totals
    public long users;
    public long admins;
    public long associates;

    public long totalCases;
    public long totalClients;

    public long hearingsNext7Days;

    public long totalJudges;
    public long judgesOnLeaveToday;
    public long totalBailRosterEntries;
    public long totalDutyMagistrateEntries;
    public long totalPoliceStations;

    // Case counts grouped for the charts
    public Map<String, Long> casesByStatus;
    public Map<String, Long> casesByType;
    public Map<String, Long> casesByCourt;

    // New cases and clients per month
    public List<Month> monthly;

    // One month of the growth chart
    public record Month(String month, long cases, long clients) {}
}
