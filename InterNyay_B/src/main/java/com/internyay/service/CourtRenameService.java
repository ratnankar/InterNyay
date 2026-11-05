package com.internyay.service;

import com.internyay.dto.CourtDto;
import com.internyay.dto.CourtRenameRequest;
import com.internyay.entity.Court;
import com.internyay.repository.CourtRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

// Renames a court, a district, a building or a floor in the court table.
// Cases keep a link to their court table row, so a court or district name follows by itself. Everything else that keeps its
// own copy of the text (judges, court history, rosters, leave, district PDFs, police districts, and the building and floor
// written on a case) is changed in the same transaction, so nothing is left behind under the old name.
@Service
@RequiredArgsConstructor
public class CourtRenameService {

    private final CourtRepository courtRepo;
    private final CourtService courtService;
    private final EntityManager em;

    @Transactional
    public List<CourtDto> rename(CourtRenameRequest req) {
        if (req == null || req.level() == null) throw new IllegalArgumentException("Say what to rename");
        String level = req.level().trim().toLowerCase();
        String court = clean(req.court()), district = clean(req.district());
        String building = clean(req.building()), floor = clean(req.floor());
        String name = clean(req.newName());

        if (name.isEmpty()) throw new IllegalArgumentException("Enter the new name");
        int max = level.equals("building") || level.equals("floor") ? 50 : 100;
        if (name.length() > max) throw new IllegalArgumentException("The name is too long (at most " + max + " characters)");

        List<Court> all = courtRepo.findAllByOrderByIdAsc();
        switch (level) {
            case "court" -> renameCourt(all, court, name);
            case "district" -> renameDistrict(all, court, district, name);
            case "building" -> renameBuilding(all, court, district, building, name);
            case "floor" -> renameFloor(all, court, district, building, floor, name);
            default -> throw new IllegalArgumentException("Unknown level \"" + req.level() + "\"");
        }
        // The native updates bypass the loaded rows: read them again
        em.flush();
        em.clear();
        return courtService.list();
    }

    private void renameCourt(List<Court> all, String court, String name) {
        if (court.isEmpty() || all.stream().noneMatch(r -> r.getCourt().equals(court))) {
            throw new IllegalArgumentException("Court not found");
        }
        if (court.equals(name)) throw new IllegalArgumentException("That is already its name");
        if (all.stream().anyMatch(r -> !r.getCourt().equals(court) && r.getCourt().equalsIgnoreCase(name))) {
            throw new IllegalArgumentException("A court named \"" + name + "\" already exists");
        }
        update("courts", "court = ?1 WHERE court = ?2", name, court);
        for (String table : List.of("judges", "judge_court_no_records", "judges_on_leave", "duty_magistrate_roster",
                "bail_roster_records", "district_pdfs", "police_districts")) {
            update(table, "court = ?1 WHERE court = ?2", name, court);
        }
    }

    private void renameDistrict(List<Court> all, String court, String district, String name) {
        if (district.isEmpty() || all.stream().noneMatch(r -> r.getCourt().equals(court) && r.getDistrict().equals(district))) {
            throw new IllegalArgumentException("District not found");
        }
        if (district.equals(name)) throw new IllegalArgumentException("That is already its name");
        // A district name belongs to one court only (a district is looked up by its name)
        if (all.stream().anyMatch(r -> !(r.getCourt().equals(court) && r.getDistrict().equals(district))
                && r.getDistrict().equalsIgnoreCase(name))) {
            throw new IllegalArgumentException("A district named \"" + name + "\" already exists");
        }
        update("courts", "district = ?1 WHERE court = ?2 AND district = ?3", name, court, district);
        for (String table : List.of("judges", "judge_court_no_records", "judges_on_leave", "duty_magistrate_roster",
                "bail_roster_records", "district_pdfs")) {
            update(table, "district = ?1 WHERE court = ?2 AND COALESCE(district, '') = ?3", name, court, district);
        }
    }

    private void renameBuilding(List<Court> all, String court, String district, String building, String name) {
        if (building.isEmpty() || all.stream().noneMatch(r -> sameDistrict(r, court, district) && r.getBuilding().equals(building))) {
            throw new IllegalArgumentException("Building not found");
        }
        if (building.equals(name)) throw new IllegalArgumentException("That is already its name");
        if (all.stream().anyMatch(r -> sameDistrict(r, court, district) && !r.getBuilding().equals(building)
                && r.getBuilding().equalsIgnoreCase(name))) {
            throw new IllegalArgumentException("A building named \"" + name + "\" is already listed here");
        }
        update("courts", "building = ?1 WHERE court = ?2 AND district = ?3 AND building = ?4", name, court, district, building);
        // The building written on cases filed at this court / district, and on judges and their court history
        update("cases", "building = ?1 WHERE building = ?4 AND court_id IN (SELECT id FROM courts WHERE court = ?2 AND district = ?3)",
                name, court, district, building);
        for (String table : List.of("judges", "judge_court_no_records")) {
            update(table, "building = ?1 WHERE court = ?2 AND COALESCE(district, '') = ?3 AND building = ?4",
                    name, court, district, building);
        }
    }

    private void renameFloor(List<Court> all, String court, String district, String building, String floor, String name) {
        if (floor.isEmpty() || all.stream().noneMatch(r -> sameDistrict(r, court, district)
                && r.getBuilding().equals(building) && r.getFloor().equals(floor))) {
            throw new IllegalArgumentException("Floor not found");
        }
        if (floor.equals(name)) throw new IllegalArgumentException("That is already its name");
        if (all.stream().anyMatch(r -> sameDistrict(r, court, district) && r.getBuilding().equals(building)
                && !r.getFloor().equals(floor) && r.getFloor().equalsIgnoreCase(name))) {
            throw new IllegalArgumentException("A floor named \"" + name + "\" is already listed here");
        }
        update("courts", "floor = ?1 WHERE court = ?2 AND district = ?3 AND building = ?4 AND floor = ?5",
                name, court, district, building, floor);
        update("cases", "floor = ?1 WHERE floor = ?5 AND COALESCE(building, '') = ?4 AND court_id IN (SELECT id FROM courts WHERE court = ?2 AND district = ?3)",
                name, court, district, building, floor);
        for (String table : List.of("judges", "judge_court_no_records")) {
            update(table, "floor = ?1 WHERE court = ?2 AND COALESCE(district, '') = ?3 AND COALESCE(building, '') = ?4 AND floor = ?5",
                    name, court, district, building, floor);
        }
    }

    private static boolean sameDistrict(Court r, String court, String district) {
        return r.getCourt().equals(court) && r.getDistrict().equals(district);
    }

    // "UPDATE <table> SET <set-and-where>" with ?1, ?2 ... filled from args
    private void update(String table, String setAndWhere, Object... args) {
        var q = em.createNativeQuery("UPDATE " + table + " SET " + setAndWhere);
        for (int i = 0; i < args.length; i++) q.setParameter(i + 1, args[i]);
        q.executeUpdate();
    }

    private static String clean(String s) { return s == null ? "" : s.trim(); }
}
