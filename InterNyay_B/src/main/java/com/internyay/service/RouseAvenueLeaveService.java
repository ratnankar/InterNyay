package com.internyay.service;

import com.internyay.entity.Judge;
import com.internyay.entity.JudgeOnLeave;
import com.internyay.repository.JudgeOnLeaveRepository;
import com.internyay.repository.JudgeRepository;
import com.internyay.util.CourtMatch;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

// Rouse Avenue leaves can't be scraped, they are derived from the leaves of the district judges in the Judges List
@Service
@RequiredArgsConstructor
@Slf4j
public class RouseAvenueLeaveService {

    public static final String ROUSE_AVENUE = "Rouse Avenue";

    private static final List<String[]> SOURCE_DISTRICTS = List.of(
            new String[] { "Tis Hazari",    "Central"   },
            new String[] { "Patiala House", "New Delhi" }
    );

    private final JudgeOnLeaveRepository leaveRepo;
    private final JudgeRepository judgeRepo;

    // True for the Rouse Avenue court name
    public static boolean isRouseAvenue(String court) {
        return court != null && ROUSE_AVENUE.equalsIgnoreCase(court.trim());
    }

    // On leave on a given date
    public List<JudgeOnLeave> onLeaveOn(LocalDate date) {
        return derive((court, district) -> leaveRepo.findOnLeaveOn(court, district, date));
    }

    // On leave today
    public List<JudgeOnLeave> onLeaveToday(LocalDate today) {
        return derive((court, district) -> leaveRepo.findOnLeaveToday(court, district, today));
    }

    // Starting after today
    public List<JudgeOnLeave> upcoming(LocalDate today) {
        return derive((court, district) -> leaveRepo.findUpcomingLeave(court, district, today));
    }

    public List<JudgeOnLeave> past(LocalDate today) {
        return derive((court, district) -> leaveRepo.findPastLeave(court, district, today));
    }

    // Runs the given leave query for each Rouse Avenue judge's district
    private List<JudgeOnLeave> derive(BiFunction<String, String, List<JudgeOnLeave>> source) {

        List<Judge> rouseJudges = judgeRepo.findByFilters(ROUSE_AVENUE, null);

        if (rouseJudges.isEmpty()) {
            log.debug("Rouse Avenue leave: the Judges List holds no Rouse Avenue judges, "
                    + "so there is nothing to intersect the Central / New Delhi leave with");
            return List.of();
        }

        Map<String, JudgeOnLeave> found = new LinkedHashMap<>();

        for (String[] origin : SOURCE_DISTRICTS) {
            for (JudgeOnLeave row : source.apply(origin[0], origin[1])) {

                Judge match = rouseJudges.stream()
                        .filter(j -> CourtMatch.sameJudge(j.getName(), row.getName()))
                        .findFirst()
                        .orElse(null);

                if (match == null) continue;

                String key = match.getId() + "|" + row.getLeaveFrom() + "|" + row.getLeaveTo();

                found.putIfAbsent(key, JudgeOnLeave.builder()
                        .id(row.getId())
                        .name(match.getName())
                        .court(ROUSE_AVENUE)
                        .district(ROUSE_AVENUE)
                        .leaveFrom(row.getLeaveFrom())
                        .leaveTo(row.getLeaveTo())
                        .reason(row.getReason())
                        .build());

                log.debug("Rouse Avenue leave: {} (listed as '{}' under {} / {}) is on leave {} – {}",
                        match.getName(), row.getName(), origin[0], origin[1],
                        row.getLeaveFrom(), row.getLeaveTo());
            }
        }

        return new ArrayList<>(found.values());
    }
}
