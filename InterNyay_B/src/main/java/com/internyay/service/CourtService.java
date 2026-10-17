package com.internyay.service;

import com.internyay.dto.CourtDto;
import com.internyay.dto.CourtRequest;
import com.internyay.entity.Court;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.CourtRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;

// The court table is the only source of courts, districts, buildings and court numbers
@Service
@RequiredArgsConstructor
public class CourtService {

    private final CourtRepository repo;
    private final CaseRepository caseRepo;
    private final EntityManager em;

    public List<CourtDto> list() {
        return repo.findAllByOrderByIdAsc().stream().map(CourtDto::from).toList();
    }

    // Districts under a court, empty when the court is unknown or has none
    public List<String> districtsOf(String court) {
        if (court == null) return List.of();
        String wanted = court.trim();
        return new LinkedHashSet<>(repo.findAllByOrderByIdAsc().stream()
                .filter(c -> c.getCourt().equalsIgnoreCase(wanted) && !c.getDistrict().isEmpty())
                .map(Court::getDistrict).toList()).stream().toList();
    }

    // Court a district belongs to
    public Optional<String> courtOf(String district) {
        if (district == null || district.isBlank()) return Optional.empty();
        String wanted = district.trim();
        return repo.findAllByOrderByIdAsc().stream()
                .filter(c -> c.getDistrict().equalsIgnoreCase(wanted))
                .map(Court::getCourt).findFirst();
    }

    // High courts are the courts flagged as such in the table
    public Optional<String> highCourt(String court) {
        if (court == null || court.isBlank()) return Optional.empty();
        String wanted = court.trim();
        return repo.findAllByOrderByIdAsc().stream()
                .filter(c -> c.isHighCourt() && c.getCourt().equalsIgnoreCase(wanted))
                .map(Court::getCourt).findFirst();
    }

    // Court in its stored spelling, throws when it is not in the table
    public String requireCourt(String court) {
        if (court == null || court.isBlank()) throw new IllegalArgumentException("Court is required");
        String wanted = court.trim();
        return repo.findAllByOrderByIdAsc().stream()
                .map(Court::getCourt).filter(c -> c.equalsIgnoreCase(wanted)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown court \"" + wanted + "\""));
    }

    // District in its stored spelling, throws when it is not in the table
    public String requireDistrict(String district) {
        if (district == null || district.isBlank()) throw new IllegalArgumentException("District is required");
        String wanted = district.trim();
        return repo.findAllByOrderByIdAsc().stream()
                .map(Court::getDistrict).filter(d -> !d.isEmpty() && d.equalsIgnoreCase(wanted)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown district \"" + wanted + "\""));
    }

    // District must exist and belong to the given court
    public String requireDistrictOf(String court, String district) {
        String canonical = requireDistrict(district);
        if (!districtsOf(court).contains(canonical)) {
            throw new IllegalArgumentException("District \"" + canonical + "\" does not belong to the " + court + " court");
        }
        return canonical;
    }

    // The row a case is filed at: the court's own row for a high court (it has no district), otherwise the
    // district row under the court. Names are matched ignoring case. Throws when the court or district is not in the table
    public Court placeOf(String court, String district) {
        if (court == null || court.isBlank()) throw new IllegalArgumentException("Court is required");
        String wantedCourt = court.trim();

        List<Court> all = repo.findAllByOrderByIdAsc();
        List<Court> ofCourt = all.stream().filter(r -> r.getCourt().equalsIgnoreCase(wantedCourt)).toList();
        if (ofCourt.isEmpty()) throw new IllegalArgumentException("Unknown court \"" + wantedCourt + "\"");

        // The plain court row (no district, building or court no.) is the one a high court case links to
        if (ofCourt.stream().anyMatch(Court::isHighCourt)) {
            return ofCourt.stream()
                    .filter(r -> r.getDistrict().isEmpty() && r.getBuilding().isEmpty() && r.getCourtNo().isEmpty())
                    .findFirst().orElse(ofCourt.get(0));
        }

        if (district == null || district.isBlank()) throw new IllegalArgumentException("District is required");
        String wantedDistrict = district.trim();

        List<Court> ofDistrict = ofCourt.stream()
                .filter(r -> !r.getDistrict().isEmpty() && r.getDistrict().equalsIgnoreCase(wantedDistrict)).toList();
        if (ofDistrict.isEmpty()) {
            boolean known = all.stream().anyMatch(r -> !r.getDistrict().isEmpty() && r.getDistrict().equalsIgnoreCase(wantedDistrict));
            throw new IllegalArgumentException(known
                    ? "District \"" + wantedDistrict + "\" does not belong to the " + ofCourt.get(0).getCourt() + " court"
                    : "Unknown district \"" + wantedDistrict + "\"");
        }

        // The district's own row (no building or court no.) is the one a district court case links to
        return ofDistrict.stream()
                .filter(r -> r.getBuilding().isEmpty() && r.getCourtNo().isEmpty())
                .findFirst().orElse(ofDistrict.get(0));
    }

    // The row a judge listing links to. Like placeOf, but a listing may be made without a district: then it links to the
    // plain court row (no district, building or court no.), which is created when the court only had district rows.
    // Cases keep using placeOf, so a case still always needs a district
    public Court listingBaseOf(String court, String district) {
        String d = clean(district);
        if (!d.isEmpty()) return placeOf(court, d);
        if (clean(court).isEmpty()) throw new IllegalArgumentException("Court is required");

        List<Court> ofCourt = repo.findAllByOrderByIdAsc().stream()
                .filter(r -> r.getCourt().equalsIgnoreCase(clean(court))).toList();
        if (ofCourt.isEmpty()) throw new IllegalArgumentException("Unknown court \"" + clean(court) + "\"");
        if (ofCourt.stream().anyMatch(Court::isHighCourt)) return placeOf(court, "");

        return ofCourt.stream()
                .filter(r -> r.getDistrict().isEmpty() && r.getBuilding().isEmpty() && r.getCourtNo().isEmpty())
                .findFirst()
                .orElseGet(() -> repo.save(Court.builder().court(ofCourt.get(0).getCourt())
                        .district("").building("").courtNo("").highCourt(false).build()));
    }

    // Court no. for a case: must be listed in the table for the case's court and district (any building).
    // Returns it in the stored spelling, or null when blank
    public String requireCourtNo(Court place, String courtNo) {
        String n = clean(courtNo);
        if (n.isEmpty()) return null;
        return repo.findAllByOrderByIdAsc().stream()
                .filter(r -> r.getCourt().equals(place.getCourt()) && r.getDistrict().equals(place.getDistrict())
                        && !r.getCourtNo().isEmpty() && r.getCourtNo().equalsIgnoreCase(n))
                .map(Court::getCourtNo).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Court no. \"" + n + "\" is not listed for "
                        + (place.getDistrict().isEmpty() ? place.getCourt() : place.getDistrict() + " / " + place.getCourt())
                        + " in the court table"));
    }

    // The row for a court, district, building and court no. that all exist in the table, in their stored spelling.
    // A blank building or court no. is skipped. Nothing is created here: new places are added under Admin > Courts
    public Court requirePlace(String court, String district, String building, String courtNo) {
        Court base = listingBaseOf(court, district);
        String b = clean(building), n = clean(courtNo);
        if (b.isEmpty() && n.isEmpty()) return base;

        List<Court> rows = repo.findAllByOrderByIdAsc().stream()
                .filter(r -> r.getCourt().equals(base.getCourt()) && r.getDistrict().equals(base.getDistrict()))
                .toList();
        String where = base.getDistrict().isEmpty() ? base.getCourt() : base.getDistrict() + " / " + base.getCourt();

        if (!b.isEmpty() && rows.stream().noneMatch(r -> r.getBuilding().equalsIgnoreCase(b))) {
            throw new IllegalArgumentException("Building \"" + b + "\" is not listed for " + where
                    + " in the court table. Add it under Admin > Courts first");
        }
        if (n.isEmpty()) {
            return rows.stream().filter(r -> r.getBuilding().equalsIgnoreCase(b)).findFirst().orElse(base);
        }
        return rows.stream()
                .filter(r -> r.getBuilding().equalsIgnoreCase(b) && r.getCourtNo().equalsIgnoreCase(n))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Court no. \"" + n + "\" is not listed for " + where
                        + (b.isEmpty() ? "" : ", building " + b) + " in the court table. Add it under Admin > Courts first"));
    }

    private void insert(String court, String district, String building, String courtNo, boolean highCourt) {
        String c = clean(court);
        if (c.isEmpty()) return;
        String d = clean(district), b = clean(building), n = clean(courtNo);
        if (!repo.existsByCourtAndDistrictAndBuildingAndCourtNo(c, d, b, n)) {
            repo.save(Court.builder().court(c).district(d).building(b).courtNo(n).highCourt(highCourt).build());
        }
    }

    // Admin marks a court room as a Mahila court (orders are not declared there) or clears the mark.
    // Only a row with a court no. can be marked, because the mark belongs to one court room
    @Transactional
    public List<CourtDto> setMahilaCourt(Long id, boolean mahilaCourt) {
        Court row = repo.findById(id).orElseThrow(() -> new NoSuchElementException("Court entry not found"));
        if (row.getCourtNo().isEmpty()) {
            throw new IllegalArgumentException("Only a court no. can be marked as a Mahila court");
        }
        row.setMahilaCourt(mahilaCourt);
        repo.save(row);
        return list();
    }

    // Admin adds at any level: a court, a district under a court, a building or a court no. A building and a court no. can be
    // added without a district (they then wait in the court's "no district" list until a district is chosen)
    @Transactional
    public List<CourtDto> add(CourtRequest req) {
        String court = clean(req.getCourt()), district = clean(req.getDistrict());
        String building = clean(req.getBuilding()), courtNo = clean(req.getCourtNo());
        if (court.isEmpty()) throw new IllegalArgumentException("Court is required");

        List<Court> rows = repo.findAllByOrderByIdAsc().stream()
                .filter(r -> r.getCourt().equalsIgnoreCase(court)).toList();
        boolean exists = !rows.isEmpty();
        boolean isHigh = exists ? rows.stream().anyMatch(Court::isHighCourt) : req.isHighCourt();
        String stored = exists ? rows.get(0).getCourt() : court;

        if (isHigh && !district.isEmpty()) {
            throw new IllegalArgumentException(stored + " is a high court and cannot have districts");
        }
        // Keep the stored spelling of a court or district that already exists
        String storedDistrict = rows.stream().map(Court::getDistrict)
                .filter(d -> !d.isEmpty() && d.equalsIgnoreCase(district)).findFirst().orElse(district);

        // Keep the stored spelling of a building that already exists under this district
        String storedBuilding = rows.stream().filter(r -> r.getDistrict().equals(storedDistrict)).map(Court::getBuilding)
                .filter(b -> !b.isEmpty() && b.equalsIgnoreCase(building)).findFirst().orElse(building);
        String where = storedDistrict.isEmpty() ? stored + " (no district)" : storedDistrict + " / " + stored;

        // Say so when the building or court no. is already there, instead of reporting a silent success
        if (!building.isEmpty() && courtNo.isEmpty()
                && rows.stream().anyMatch(r -> r.getDistrict().equals(storedDistrict) && r.getBuilding().equalsIgnoreCase(building))) {
            throw new IllegalArgumentException("Building " + storedBuilding + " is already listed for " + where);
        }
        if (!courtNo.isEmpty() && rows.stream().anyMatch(r -> r.getDistrict().equals(storedDistrict)
                && r.getBuilding().equalsIgnoreCase(building) && r.getCourtNo().equalsIgnoreCase(courtNo))) {
            throw new IllegalArgumentException("Court no. " + courtNo + " is already listed for " + where
                    + (building.isEmpty() ? "" : ", building " + storedBuilding));
        }

        if (!exists && district.isEmpty() && building.isEmpty() && courtNo.isEmpty()) {
            insert(stored, "", "", "", isHigh);
        } else {
            // make sure each level above the new one is in the table too
            if (!exists) insert(stored, "", "", "", isHigh);
            if (!storedDistrict.isEmpty()) insert(stored, storedDistrict, "", "", false);
            if (!building.isEmpty()) insert(stored, storedDistrict, storedBuilding, "", isHigh);
            if (!courtNo.isEmpty()) insert(stored, storedDistrict, storedBuilding, courtNo, isHigh);
        }
        return list();
    }

    // scope: row = just this row, district = the district with all its buildings and court numbers,
    // court = the whole court with all its districts. Refused while a case or a judge still uses it (court history never blocks it).
    @Transactional
    public List<CourtDto> delete(Long id, String scope) {
        Court target = repo.findById(id).orElseThrow(() -> new NoSuchElementException("Court entry not found"));
        String mode = scope == null ? "row" : scope.trim().toLowerCase();
        if (mode.equals("district") && target.getDistrict().isEmpty()) {
            throw new IllegalArgumentException("This is not a district. Remove its buildings and court numbers one by one");
        }

        List<Court> rows = repo.findAllByOrderByIdAsc().stream().filter(r -> switch (mode) {
            case "court" -> r.getCourt().equals(target.getCourt());
            case "district" -> r.getCourt().equals(target.getCourt()) && r.getDistrict().equals(target.getDistrict());
            case "row" -> r.getId().equals(target.getId());
            default -> throw new IllegalArgumentException("Unknown scope \"" + scope + "\"");
        }).toList();

        String blocker = usedBy(target, mode, rows.stream().map(Court::getId).toList());
        if (blocker != null) {
            throw new IllegalArgumentException("Cannot remove it, it is still used by " + blocker + ". Move or delete those first.");
        }

        repo.deleteAll(rows);
        return list();
    }

    // Names what still points at the court / district / court no., null when nothing does.
    // Only live judge listings count: a removed listing (active = false) is kept for history only and never blocks removal
    // rowIds are the rows that would be deleted: a case is linked to its row, so any case linked to one of them blocks it
    private String usedBy(Court t, String mode, List<Long> rowIds) {
        List<String> used = new java.util.ArrayList<>();

        // Deleted cases stay in the table and can be restored, so they keep the link too and are counted separately
        long activeCases = caseRepo.countActiveAtCourts(rowIds);
        long deletedCases = caseRepo.countDeletedAtCourts(rowIds);
        if (activeCases > 0) used.add(activeCases + " cases");
        if (deletedCases > 0) used.add(deletedCases + " deleted cases");

        boolean roomOnly = mode.equals("row") && !t.getCourtNo().isEmpty();

        if (roomOnly) {
            count(used, "judges", "SELECT COUNT(*) FROM judges WHERE active = TRUE AND court = ?1 AND district = ?2 AND court_room_no = ?3",
                    t.getCourt(), t.getDistrict(), t.getCourtNo());
            // Court history does not block removal: each history period stores its own court, district, building
            // and court no. as text (no link to this table), so it stays exactly as it was after the row is gone
            return used.isEmpty() ? null : String.join(", ", used);
        }
        if (mode.equals("row") && t.getCourtNo().isEmpty() && !t.getBuilding().isEmpty()) {
            return used.isEmpty() ? null : String.join(", ", used);
        }

        boolean wholeCourt = mode.equals("court");
        String where = wholeCourt ? "court = ?1" : "court = ?1 AND district = ?2";
        Object[] args = wholeCourt ? new Object[]{t.getCourt()} : new Object[]{t.getCourt(), t.getDistrict()};

        count(used, "judges", "SELECT COUNT(*) FROM judges WHERE active = TRUE AND " + where, args);
        count(used, "bail roster entries", "SELECT COUNT(*) FROM bail_roster_records WHERE " + where, args);
        count(used, "duty magistrate entries", "SELECT COUNT(*) FROM duty_magistrate_roster WHERE " + where, args);
        count(used, "judges on leave entries", "SELECT COUNT(*) FROM judges_on_leave WHERE " + where, args);
        count(used, "district PDFs", "SELECT COUNT(*) FROM district_pdfs WHERE " + where, args);
        count(used, "police districts", "SELECT COUNT(*) FROM police_districts WHERE court = ?1", t.getCourt());
        return used.isEmpty() ? null : String.join(", ", used);
    }

    private void count(List<String> used, String label, String sql, Object... args) {
        var q = em.createNativeQuery(sql);
        for (int i = 0; i < args.length; i++) q.setParameter(i + 1, args[i]);
        long n = ((Number) q.getSingleResult()).longValue();
        if (n > 0) used.add(n + " " + label);
    }

    private static String clean(String s) { return s == null ? "" : s.trim(); }
}