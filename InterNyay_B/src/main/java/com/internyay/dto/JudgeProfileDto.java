package com.internyay.dto;

import com.internyay.entity.JudgeProfile;

import java.util.List;

// A judge (name and photo) with the courts the judge holds now. No courts = the judge is not in any listing.
// courts are the readable labels (court, place, court no.); courtNames are just the court names, for filtering by court;
// seats are the same courts as separate fields (court, building, court no.), for the court / building / court no. wise listing
public record JudgeProfileDto(Long id, String name, String photo, boolean active,
                              int courtCount, List<String> courts, List<String> courtNames, List<JudgeSeatDto> seats) {

    public static JudgeProfileDto from(JudgeProfile p, List<String> courts, List<String> courtNames, List<JudgeSeatDto> seats) {
        return new JudgeProfileDto(p.getId(), p.getName(), p.getPhoto(), p.isActive(), courts.size(), courts, courtNames, seats);
    }
}
