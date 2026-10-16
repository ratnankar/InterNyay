package com.internyay.service;

import com.internyay.dto.*;
import com.internyay.entity.Judge;
import com.internyay.entity.JudgeOnLeave;
import com.internyay.util.CourtMatch;
import com.internyay.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

// Judges on leave for Quick Access
@Service
@RequiredArgsConstructor
public class QuickAccessService {

    private final JudgeOnLeaveRepository judgeOnLeaveRepo;
    private final RouseAvenueLeaveService rouseAvenueLeave;
    private final JudgeRepository judgeRepo;

    public JudgeOnLeaveResponse getJudgesOnLeave(
            String court,
            String district) {

        LocalDate today = LocalDate.now();

        String courtFilter = nullIfBlank(court);
        String districtFilter = nullIfBlank(district);

        // Judges List entries for the same filters, used to look up each judge's photo
        List<Judge> listed = judgeRepo.findByFilters(courtFilter, districtFilter).stream()
                .filter(j -> j.getPhoto() != null && !j.getPhoto().isBlank())
                .collect(Collectors.toList());

        return JudgeOnLeaveResponse.builder()

                .onLeaveToday(
                        toDtos(withRouseAvenue(
                                judgeOnLeaveRepo.findOnLeaveToday(courtFilter, districtFilter, today),
                                courtFilter,
                                rouseAvenueLeave.onLeaveToday(today)), listed))

                .upcoming(
                        toDtos(withRouseAvenue(
                                judgeOnLeaveRepo.findUpcomingLeave(courtFilter, districtFilter, today),
                                courtFilter,
                                rouseAvenueLeave.upcoming(today)), listed))

                .past(
                        toDtos(withRouseAvenue(
                                judgeOnLeaveRepo.findPastLeave(courtFilter, districtFilter, today),
                                courtFilter,
                                rouseAvenueLeave.past(today)), listed))

                .build();
    }

    // Adds Rouse Avenue leaves, which are derived from the Judges List
    private List<JudgeOnLeave> withRouseAvenue(List<JudgeOnLeave> stored,
                                               String courtFilter,
                                               List<JudgeOnLeave> derived) {

        boolean wanted = courtFilter == null || RouseAvenueLeaveService.isRouseAvenue(courtFilter);
        if (!wanted || derived.isEmpty()) return stored;

        List<JudgeOnLeave> all = new ArrayList<>(stored);
        all.addAll(derived);
        return all;
    }

    // Entities to DTOs, each with the photo of the matching judge in the Judges List
    private List<JudgeOnLeaveDto> toDtos(List<JudgeOnLeave> rows, List<Judge> listed) {
        return rows.stream().map(row -> {
            JudgeOnLeaveDto dto = JudgeOnLeaveDto.from(row);
            dto.setPhoto(photoFor(row, listed));
            return dto;
        }).collect(Collectors.toList());
    }

    // Photo of the listed judge with the same name, preferring the same court and district; null when there is none
    private String photoFor(JudgeOnLeave row, List<Judge> listed) {

        Judge sameCourt = listed.stream()
                .filter(j -> CourtMatch.sameJudge(j.getName(), row.getName()))
                .filter(j -> j.getCourt().equalsIgnoreCase(String.valueOf(row.getCourt()))
                        && j.getDistrict().equalsIgnoreCase(String.valueOf(row.getDistrict())))
                .findFirst()
                .orElse(null);

        if (sameCourt != null) return sameCourt.getPhoto();

        return listed.stream()
                .filter(j -> CourtMatch.sameJudge(j.getName(), row.getName()))
                .map(Judge::getPhoto)
                .findFirst()
                .orElse(null);
    }

    // Empty becomes null
    private String nullIfBlank(String value) {

        return value == null || value.isBlank()
                ? null
                : value;
    }
}
