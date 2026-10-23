package com.internyay.service;

import com.internyay.dto.HearingLeaveDto;
import com.internyay.dto.JudgeCourtNoDto;
import com.internyay.entity.Case;
import com.internyay.entity.Hearing;
import com.internyay.entity.JudgeOnLeave;
import com.internyay.entity.Holiday;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.HearingRepository;
import com.internyay.repository.HolidayRepository;
import com.internyay.repository.JudgeOnLeaveRepository;
import com.internyay.repository.JudgeRepository;
import com.internyay.util.CourtMatch;
import com.internyay.util.HolidayCourts;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

// Finds which hearings fall on a day when the case's judge is on leave
@Service
@RequiredArgsConstructor
@Slf4j
public class HearingLeaveService {

    private final CaseRepository caseRepo;
    private final JudgeRepository judgeRepo;
    private final JudgeOnLeaveRepository leaveRepo;
    private final HearingRepository hearingRepo;
    private final RouseAvenueLeaveService rouseAvenueLeave;
    private final HolidayRepository holidayRepo;
    private final CourtService courtService;

    // Per request cache so the same court isn't queried again for every case
    private class Lookup {
        private final Map<String, List<JudgeCourtNoDto>> judges = new HashMap<>();
        private final Map<String, List<JudgeOnLeave>> leaves = new HashMap<>();

        // Judges of a court and district
        List<JudgeCourtNoDto> judgesIn(Case c) {
            return judges.computeIfAbsent(c.getCourt() + "|" + c.getDistrict(),
                    k -> judgeRepo.findCourtNumbers(c.getCourt(), c.getDistrict()));
        }

        // Leaves on a date, Rouse Avenue leaves come from their own source
        List<JudgeOnLeave> leavesOn(Case c, LocalDate date) {
            return leaves.computeIfAbsent(c.getCourt() + "|" + c.getDistrict() + "|" + date,
                    k -> {
                        List<JudgeOnLeave> stored =
                                leaveRepo.findOnLeaveOn(c.getCourt(), c.getDistrict(), date);

                        if (!RouseAvenueLeaveService.isRouseAvenue(c.getCourt())) return stored;

                        List<JudgeOnLeave> all = new ArrayList<>(stored);
                        all.addAll(rouseAvenueLeave.onLeaveOn(date));
                        return all;
                    });
        }
    }

    // Cases listed that day, from next hearing dates first and then past hearings
    public List<HearingLeaveDto> onLeaveFor(Long userId, LocalDate date) {

        Lookup lookup = new Lookup();
        List<HearingLeaveDto> result = new ArrayList<>();

        Set<Long> seen = new HashSet<>();

        // Upcoming hearings: judge info, or just the cause list number when the judge is unknown
        for (Case c : caseRepo.findByUser_IdAndNextHearing(userId, date)) {

            seen.add(c.getId());
            Integer causeListNo = causeListNoFor(c, date);
            Optional<HearingLeaveDto> info = judgeInfo(c, date, causeListNo, lookup);

            if (info.isPresent()) {
                result.add(info.get());
            } else if (causeListNo != null) {
                result.add(HearingLeaveDto.listingOnly(c, date, causeListNo));
            }
        }

        // Hearings already logged for that day, skipping cases handled above
        for (Hearing h : hearingRepo.findWithCaseByUserAndDate(userId, date)) {

            Case c = h.getLegalCase();
            if (!seen.add(c.getId())) continue;

            String judge = h.getJudgeName() != null
                    ? h.getJudgeName()
                    : judgeNameFor(c, lookup).orElse(null);
            // The case row only holds the number of its next date, a heard hearing keeps its own
            Integer causeListNo = h.getCauseListNo() != null ? h.getCauseListNo() : causeListNoFor(c, date);

            if (judge != null) {
                result.add(HearingLeaveDto.sitting(c, date, judge, causeListNo));
            } else if (causeListNo != null) {
                result.add(HearingLeaveDto.listingOnly(c, date, causeListNo));
            }
        }

        return result;
    }

    // Judge sitting in the case's court number
    public Optional<String> judgeNameFor(Case c) {
        return judgeNameFor(c, new Lookup());
    }

    // Same lookup using a shared cache
    private Optional<String> judgeNameFor(Case c, Lookup lookup) {
        if (c.getCourt() == null || CourtMatch.courtNo(c.getCourtNo()) == null) {
            return Optional.empty();
        }

        return lookup.judgesIn(c).stream()
                .filter(j -> CourtMatch.sameCourtNo(c.getCourtNo(), j.courtRoomNo()))
                .map(JudgeCourtNoDto::judgeName)
                .findFirst();
    }

    // Cause list number only counts for the date it was listed
    private Integer causeListNoFor(Case c, LocalDate date) {
        return date.equals(c.getListingDate()) ? c.getCauseListNo() : null;
    }

    // Judge for the case's court number and whether they are on leave that date
    private Optional<HearingLeaveDto> judgeInfo(Case c, LocalDate date, Integer causeListNo, Lookup lookup) {

        if (c.getCourt() == null || CourtMatch.courtNo(c.getCourtNo()) == null) {
            log.debug("Hearing {} case {}: court '{}' / court no. '{}' — nothing to look a judge up by",
                    date, c.getId(), c.getCourt(), c.getCourtNo());
            return Optional.empty();
        }

        List<JudgeCourtNoDto> judges = lookup.judgesIn(c);

        List<JudgeCourtNoDto> inRoom = judges.stream()
                .filter(j -> CourtMatch.sameCourtNo(c.getCourtNo(), j.courtRoomNo()))
                .toList();

        if (inRoom.isEmpty()) {
            log.debug("Hearing {} case {}: no judge in court no. '{}' (compared as '{}' / number '{}') "
                            + "in {} / {} — directory holds {} judge(s) with a court no.: {}",
                    date, c.getId(), c.getCourtNo(),
                    CourtMatch.courtNo(c.getCourtNo()), CourtMatch.courtNoNumber(c.getCourtNo()),
                    c.getCourt(), c.getDistrict(), judges.size(),
                    judges.stream().limit(15)
                            .map(j -> "'" + j.courtRoomNo() + "' (" + CourtMatch.courtNo(j.courtRoomNo()) + ") = " + j.judgeName())
                            .toList());
            return Optional.empty();
        }

        // Same rule as the Judges on Leave page: leave doesn't count on a Sunday or on a holiday of the judge's court
        List<JudgeOnLeave> leaves = leaveCounts(c, date) ? lookup.leavesOn(c, date) : List.of();

        for (JudgeCourtNoDto judge : inRoom) {
            for (JudgeOnLeave leave : leaves) {
                if (CourtMatch.sameJudge(judge.judgeName(), leave.getName())) {
                    log.debug("Hearing {} case {}: {} is ON LEAVE ({} - {})",
                            date, c.getId(), judge.judgeName(), leave.getLeaveFrom(), leave.getLeaveTo());
                    return Optional.of(HearingLeaveDto.onLeave(c, date, judge.judgeName(), leave, causeListNo));
                }
            }
        }

        JudgeCourtNoDto sitting = inRoom.get(0);

        log.debug("Hearing {} case {}: {} (court no. {}) is sitting — {} on-leave row(s) for {} / {} on that date{}",
                date, c.getId(), sitting.judgeName(), c.getCourtNo(), leaves.size(), c.getCourt(), c.getDistrict(),
                leaves.isEmpty() ? " (none scraped for that date)"
                        : ", none matching by name: " + leaves.stream().map(JudgeOnLeave::getName).toList());

        return Optional.of(HearingLeaveDto.sitting(c, date, sitting.judgeName(), causeListNo));
    }

    // Whether leave counts on this date for the case's court. Never on a Sunday; a District holiday removes District Court
    // judges, a High Court holiday removes High Court judges, and a holiday for both removes everyone
    private boolean leaveCounts(Case c, LocalDate date) {

        if (date.getDayOfWeek() == DayOfWeek.SUNDAY) return false;

        Optional<Holiday> holiday = holidayRepo.findByDate(date);
        if (holiday.isEmpty()) return true;

        String applies = HolidayCourts.orDefault(holiday.get().getCourtType()).toUpperCase();
        if (HolidayCourts.BOTH.equals(applies)) return false;

        boolean highCourt = courtService.highCourt(c.getCourt()).isPresent();
        return HolidayCourts.HIGH.equals(applies) ? !highCourt : highCourt;
    }
}
