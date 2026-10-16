package com.internyay.dto;

import com.internyay.entity.JudgeProfile;

import java.util.List;

// A judge (name and photo) with the courts the judge holds now. No courts = the judge is not in any listing
public record JudgeProfileDto(Long id, String name, String photo, boolean active,
                              int courtCount, List<String> courts) {

    public static JudgeProfileDto from(JudgeProfile p, List<String> courts) {
        return new JudgeProfileDto(p.getId(), p.getName(), p.getPhoto(), p.isActive(), courts.size(), courts);
    }
}
