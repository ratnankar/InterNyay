package com.internyay.service;

import com.internyay.dto.CourtDto;
import com.internyay.dto.CourtMoveRequest;
import com.internyay.entity.Court;
import com.internyay.entity.DutyMagistrate;
import com.internyay.entity.Judge;
import com.internyay.entity.JudgeCourtNoRecord;
import com.internyay.repository.CourtRepository;
import com.internyay.repository.DutyMagistrateRepository;
import com.internyay.repository.JudgeCourtNoRecordRepository;
import com.internyay.repository.JudgeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Optional;

// Moves court numbers around inside one court, and gives a court no. its district when a judge is listed in it.
//
// A court no. that was added without a district is "unassigned": its row has an empty district. It belongs to the court
// but to no district yet. It can be moved to a district (and building) by the admin, or it moves by itself the first time
// a judge is listed in it with a district chosen. The row is changed in place, so its id and Mahila mark stay.
// A judge who sits in the court room follows it, and so do the roster rows that copy the judge's court details.
@Service
@RequiredArgsConstructor
public class CourtNoTransferService {

    private final CourtRepository courtRepo;
    private final CourtService courtService;
    private final JudgeRepository judgeRepo;
    private final JudgeCourtNoRecordRepository courtNoRepo;
    private final DutyMagistrateRepository dutyRepo;

    // ---- Admin: move a court no. to another building and district of the same court ----

    @Transactional
    public List<CourtDto> move(Long id, CourtMoveRequest req) {
        Court row = courtRepo.findById(id).orElseThrow(() -> new NoSuchElementException("Court entry not found"));
        if (row.getCourtNo().isEmpty()) throw new IllegalArgumentException("Only a court no. can be moved");

        List<Court> ofCourt = rowsOf(row.getCourt());
        boolean high = ofCourt.stream().anyMatch(Court::isHighCourt);
        String wantedDistrict = clean(req == null ? null : req.district());
        String wantedBuilding = clean(req == null ? null : req.building());

        if (high && !wantedDistrict.isEmpty()) {
            throw new IllegalArgumentException(row.getCourt() + " is a high court and has no districts");
        }
        // The district must already be one of this court's districts (or none)
        String toDistrict = wantedDistrict.isEmpty() ? "" : ofCourt.stream().map(Court::getDistrict)
                .filter(d -> !d.isEmpty() && d.equalsIgnoreCase(wantedDistrict)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("District \"" + wantedDistrict + "\" is not in the "
                        + row.getCourt() + " court. A court no. can only move inside its own court"));

        // Keep the spelling of a building that already exists there, a new building name is created
        String toBuilding = ofCourt.stream().filter(r -> r.getDistrict().equals(toDistrict)).map(Court::getBuilding)
                .filter(b -> !b.isEmpty() && b.equalsIgnoreCase(wantedBuilding)).findFirst().orElse(wantedBuilding);

        if (row.getDistrict().equals(toDistrict) && row.getBuilding().equalsIgnoreCase(toBuilding)) {
            throw new IllegalArgumentException("Court no. " + row.getCourtNo() + " is already in " + placeText(row.getCourt(), toDistrict, toBuilding));
        }
        boolean taken = ofCourt.stream().anyMatch(r -> !r.getId().equals(row.getId()) && r.getDistrict().equals(toDistrict)
                && r.getBuilding().equalsIgnoreCase(toBuilding) && r.getCourtNo().equalsIgnoreCase(row.getCourtNo()));
        if (taken) {
            throw new IllegalArgumentException("Court no. " + row.getCourtNo() + " is already listed in "
                    + placeText(row.getCourt(), toDistrict, toBuilding) + ". Remove or move that one first");
        }

        ensureBuilding(row.getCourt(), toDistrict, toBuilding, ofCourt, high);
        relocate(row, toDistrict, toBuilding, req != null && req.correction());
        return courtService.list();
    }

    // ---- Listing a judge: find (and if needed place) the court table row for the chosen court, district, building, court no. ----

    // district is null when none was chosen: then nothing is moved and only court numbers that have no district are allowed.
    // When a district was chosen:
    //   - the court no. already in that district stays where it is,
    //   - a court no. that has no district yet moves into that district,
    //   - any other court no. is refused (it is not listed there).
    // Everything is saved in the caller's transaction, so a refused listing leaves the court table untouched.
    @Transactional
    public Court resolveForListing(String court, String district, String building, String courtNo) {
        String d = clean(district), b = clean(building), n = clean(courtNo);
        Court base = courtService.listingBaseOf(court, d);
        if (b.isEmpty() && n.isEmpty()) return base;

        List<Court> rows = rowsOf(base.getCourt());
        String where = d.isEmpty() ? base.getCourt() + " without a district" : d + " / " + base.getCourt();

        // A building without a court no.: it must be listed under the district, or (when a district was chosen) wait in the
        // "no district" list, in which case it is added to the district
        if (n.isEmpty()) {
            boolean inDistrict = rows.stream().anyMatch(r -> r.getDistrict().equals(d) && r.getBuilding().equalsIgnoreCase(b));
            boolean noDistrict = !d.isEmpty() && rows.stream().anyMatch(r -> r.getDistrict().isEmpty() && r.getBuilding().equalsIgnoreCase(b));
            if (inDistrict || noDistrict) return ensureBuilding(base.getCourt(), d, b, rows, false);
            throw new IllegalArgumentException("Building \"" + b + "\" is not listed for " + where
                    + " in the court table. Add it under Admin > Courts first");
        }

        // The court no. is already in the chosen district (or, without a district, already has none): keep it
        Optional<Court> exact = rows.stream()
                .filter(r -> r.getDistrict().equals(d) && r.getBuilding().equalsIgnoreCase(b) && r.getCourtNo().equalsIgnoreCase(n))
                .findFirst();
        if (exact.isPresent()) return exact.get();

        // A court no. that has no district yet and a district was chosen: it moves into that district
        if (!d.isEmpty()) {
            Optional<Court> unassigned = rows.stream()
                    .filter(r -> r.getDistrict().isEmpty() && r.getBuilding().equalsIgnoreCase(b) && r.getCourtNo().equalsIgnoreCase(n))
                    .findFirst();
            if (unassigned.isPresent()) {
                Court u = unassigned.get();
                String oldBuilding = u.getBuilding();
                ensureBuilding(base.getCourt(), d, oldBuilding, rows, false);
                relocate(u, d, spellingIn(rows, d, oldBuilding), false);
                dropEmptyUnassignedBuilding(base.getCourt(), oldBuilding);
                return u;
            }
        }

        throw new IllegalArgumentException("Court no. \"" + n + "\" is not listed for " + where
                + (b.isEmpty() ? "" : ", building " + b) + " in the court table. "
                + (d.isEmpty() ? "Choose its district, or add it under Admin > Courts first"
                               : "Add it under Admin > Courts first"));
    }

    // ---- shared steps ----

    // Changes the row's district and building in place and carries the judge sitting in it along
    private void relocate(Court row, String toDistrict, String toBuilding, boolean correction) {
        String oldDistrict = row.getDistrict(), oldBuilding = row.getBuilding();

        // Judges are found by the place the row has now, before it changes
        List<Judge> seats = judgeRepo.findByCourtAndDistrictAndCourtRoomNoIgnoreCaseAndActiveTrue(
                        row.getCourt(), oldDistrict, row.getCourtNo()).stream()
                .filter(j -> Objects.equals(lower(blankToNull(j.getBuilding())), lower(blankToNull(oldBuilding))))
                .toList();

        row.setDistrict(toDistrict);
        row.setBuilding(toBuilding);
        courtRepo.saveAndFlush(row);

        if (seats.isEmpty()) return;
        Court base = courtService.listingBaseOf(row.getCourt(), toDistrict);
        LocalDate today = LocalDate.now();
        for (Judge judge : seats) {
            judge.setDistrict(toDistrict);
            judge.setBuilding(blankToNull(toBuilding));
            judge.setCourtId(base.getId());
            judge.setUpdatedAt(LocalDateTime.now());
            judgeRepo.save(judge);
            movePeriod(judge, row, oldDistrict, correction, today);
            refreshRoster(judge, today);
        }
    }

    // The judge's open court no. period follows the move. A court no. that had no district is only being completed, and a
    // correction fixes a wrong entry: both change the period in place. A real move keeps the old place in the history
    private void movePeriod(Judge judge, Court row, String oldDistrict, boolean correction, LocalDate today) {
        Optional<JudgeCourtNoRecord> open = courtNoRepo.findFirstByJudgeIdAndTillDateIsNullOrderByFromDateDesc(judge.getId());
        if (open.isEmpty()) return;

        JudgeCourtNoRecord current = open.get();
        boolean inPlace = correction || oldDistrict.isEmpty() || !current.getFromDate().isBefore(today);
        if (inPlace) {
            current.setCourt(row.getCourt());
            current.setDistrict(blankToNull(row.getDistrict()));
            current.setBuilding(blankToNull(row.getBuilding()));
            courtNoRepo.save(current);
            return;
        }
        current.setTillDate(today.minusDays(1));
        courtNoRepo.save(current);
        courtNoRepo.save(JudgeCourtNoRecord.builder()
                .judgeId(judge.getId())
                .courtRoomNo(current.getCourtRoomNo())
                .fromDate(today)
                .building(blankToNull(row.getBuilding()))
                .court(row.getCourt())
                .district(blankToNull(row.getDistrict()))
                .judgeName(judge.getName())
                .profileId(judge.getProfile().getId())
                .build());
    }

    // Roster rows copy the judge's court details. Rows whose duty has already ended keep what they were saved with
    private void refreshRoster(Judge judge, LocalDate from) {
        List<DutyMagistrate> linked = dutyRepo.findByJudgeId(judge.getId()).stream()
                .filter(d -> d.getTillDate() == null || Boolean.TRUE.equals(d.getFurtherOrder()) || !d.getTillDate().isBefore(from))
                .filter(d -> d.getJudgeName() == null || d.getJudgeName().equalsIgnoreCase(judge.getName()))
                .toList();
        linked.forEach(d -> d.applyJudge(judge));
        dutyRepo.saveAll(linked);
    }

    // Makes sure the building's own row (no court no.) exists under the district and returns it. A blank building has no row
    private Court ensureBuilding(String court, String district, String building, List<Court> ofCourt, boolean high) {
        if (building.isEmpty()) return null;
        String spelled = spellingIn(ofCourt, district, building);
        return rowsOf(court).stream()
                .filter(r -> r.getDistrict().equals(district) && r.getBuilding().equalsIgnoreCase(spelled) && r.getCourtNo().isEmpty())
                .findFirst()
                .orElseGet(() -> courtRepo.save(Court.builder().court(court).district(district).building(spelled)
                        .courtNo("").highCourt(high).build()));
    }

    // After a court no. left the "no district" list, a building left there with no court numbers is dropped,
    // because the building now lives in the district the court no. went to
    private void dropEmptyUnassignedBuilding(String court, String building) {
        if (building.isEmpty()) return;
        List<Court> rows = rowsOf(court).stream()
                .filter(r -> r.getDistrict().isEmpty() && r.getBuilding().equalsIgnoreCase(building)).toList();
        boolean stillUsed = rows.stream().anyMatch(r -> !r.getCourtNo().isEmpty());
        if (!stillUsed) courtRepo.deleteAll(rows);
    }

    // Spelling of a building already stored under a district, else as given
    private static String spellingIn(List<Court> ofCourt, String district, String building) {
        return ofCourt.stream().filter(r -> r.getDistrict().equals(district)).map(Court::getBuilding)
                .filter(x -> !x.isEmpty() && x.equalsIgnoreCase(building)).findFirst().orElse(building);
    }

    private List<Court> rowsOf(String court) {
        return courtRepo.findAllByOrderByIdAsc().stream().filter(r -> r.getCourt().equals(court)).toList();
    }

    private static String placeText(String court, String district, String building) {
        StringBuilder sb = new StringBuilder(district.isEmpty() ? court + " (no district)" : district + " / " + court);
        sb.append(building.isEmpty() ? ", no building" : ", building " + building);
        return sb.toString();
    }

    private static String clean(String s) { return s == null ? "" : s.trim(); }

    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    private static String lower(String s) { return s == null ? null : s.toLowerCase(); }
}
