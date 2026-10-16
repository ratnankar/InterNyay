package com.internyay.dto;

import lombok.*;

import java.util.List;

// File number info shown when adding a case
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FileNumberSummaryDto {

    // Number that will be given to the next case
    public int nextNumber;

    // Highest number held by an open case
    public int maxOccupied;

    // How many numbers are held by open cases
    public int occupiedCount;

    // Numbers freed by closed cases
    public List<Released> released;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    // A freed number with the case that held it
    public static class Released {

        public int number;

        public String caseTitle;
        public String caseNo;
    }
}
