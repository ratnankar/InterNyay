package com.internyay.service;

import com.internyay.dto.PoliceDirectoryDto;
import com.internyay.dto.PoliceRequests;
import com.internyay.entity.*;
import com.internyay.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

// Police directory: districts, sub-divisions and stations, edited by admin
@Service
@RequiredArgsConstructor
public class PoliceDirectoryService {

    static final String KEY_CAW_POST    = "caw_hq_post";
    static final String KEY_CAW_ADDRESS = "caw_hq_address";
    static final String KEY_CAW_NOTE    = "caw_hq_note";
    static final String KEY_SOURCE_NOTE = "source_note";

    private final CourtService               courtService;
    private final PoliceDistrictRepository    districts;
    private final PoliceAddlDcpRepository     addlDcps;
    private final PoliceSubDivisionRepository subDivisions;
    private final PoliceStationRepository     stations;
    private final ConsumerStationRepository   consumerStations;
    private final DrtStationRepository        drtStations;
    private final PoliceSettingRepository     settings;

    // Whole tree built from a few queries
    @Transactional(readOnly = true)
    public PoliceDirectoryDto directory() {

        List<PoliceDistrict>    districtRows = districts.findAllByOrderBySortOrderAscIdAsc();
        List<PoliceSubDivision> subRows      = subDivisions.findAllByOrderBySortOrderAscIdAsc();

        Map<Long, List<PoliceAddlDcp>> addlByDistrict = addlDcps.findAllByOrderBySortOrderAscIdAsc().stream()
                .collect(Collectors.groupingBy(a -> a.getDistrict().getId(), LinkedHashMap::new, Collectors.toList()));

        Map<Long, List<PoliceStation>> stationsBySub = stations.findAllByOrderBySortOrderAscIdAsc().stream()
                .collect(Collectors.groupingBy(s -> s.getSubDivision().getId(), LinkedHashMap::new, Collectors.toList()));

        Map<Long, List<PoliceSubDivision>> subsByDistrict = subRows.stream()
                .collect(Collectors.groupingBy(s -> s.getDistrict().getId(), LinkedHashMap::new, Collectors.toList()));

        List<PoliceDirectoryDto.District> out = new ArrayList<>();

        for (PoliceDistrict d : districtRows) {

            List<PoliceDirectoryDto.Office> addl = addlByDistrict.getOrDefault(d.getId(), List.of()).stream()
                    .map(a -> PoliceDirectoryDto.Office.builder()
                            .id(a.getId()).post(a.getPost()).address(a.getAddress())
                            .email(a.getEmail()).phone(a.getPhone()).build())
                    .toList();

            List<PoliceDirectoryDto.SubDivision> subs = subsByDistrict.getOrDefault(d.getId(), List.of()).stream()
                    .map(sd -> PoliceDirectoryDto.SubDivision.builder()
                            .id(sd.getId()).acp(sd.getAcp()).address(sd.getAddress())
                            .email(sd.getEmail()).phone(sd.getPhone())
                            .stations(stationsBySub.getOrDefault(sd.getId(), List.of()).stream()
                                    .map(ps -> PoliceDirectoryDto.Station.builder()
                                            .id(ps.getId()).name(ps.getName()).phone(ps.getPhone())
                                            .email(ps.getEmail()).address(ps.getAddress()).pin(ps.getPin()).build())
                                    .toList())
                            .build())
                    .toList();

            out.add(PoliceDirectoryDto.District.builder()
                    .id(d.getId()).name(d.getName()).range(d.getPoliceRange())
                    .court(d.getCourt()).defaultType(d.getDefaultType()).hq(d.getHq())
                    .dcp(PoliceDirectoryDto.Office.builder()
                            .post(d.getDcpPost()).address(d.getDcpAddress())
                            .email(d.getDcpEmail()).phone(d.getDcpPhone()).build())
                    .addlDcp(addl)
                    .caw(PoliceDirectoryDto.Office.builder()
                            .post(d.getCawPost()).address(d.getCawAddress())
                            .email(d.getCawEmail()).phone(d.getCawPhone()).build())
                    .subDivisions(subs)
                    .build());
        }

        Map<String, String> notes = settings.findAll().stream()
                .filter(s -> s.getValue() != null)
                .collect(Collectors.toMap(PoliceSetting::getKey, PoliceSetting::getValue, (a, b) -> b));

        return PoliceDirectoryDto.builder()
                .districts(out)
                .cawHeadquarter(PoliceDirectoryDto.CawHeadquarter.builder()
                        .post(notes.get(KEY_CAW_POST))
                        .address(notes.get(KEY_CAW_ADDRESS))
                        .note(notes.get(KEY_CAW_NOTE))
                        .build())
                .sourceNote(notes.get(KEY_SOURCE_NOTE))
                .build();
    }

    // District names are unique
    @Transactional
    public PoliceDirectoryDto createDistrict(PoliceRequests.DistrictRequest req) {

        String name = req.getName().trim();
        if (districts.existsByNameIgnoreCase(name)) {
            throw new IllegalArgumentException("A district named \"" + name + "\" already exists");
        }

        PoliceDistrict d = new PoliceDistrict();
        d.setSortOrder(nextSortOrder(districts.findAllByOrderBySortOrderAscIdAsc().stream()
                .map(PoliceDistrict::getSortOrder)));
        applyDistrict(d, req);
        districts.save(d);
        replaceAddlDcps(d, req.getAddlDcp());

        return directory();
    }

    // Edit a district and its additional DCP offices
    @Transactional
    public PoliceDirectoryDto updateDistrict(Long id, PoliceRequests.DistrictRequest req) {

        PoliceDistrict d = districts.findById(id)
                .orElseThrow(() -> new NoSuchElementException("District not found"));

        String name = req.getName().trim();
        if (districts.existsByNameIgnoreCaseAndIdNot(name, id)) {
            throw new IllegalArgumentException("A district named \"" + name + "\" already exists");
        }

        applyDistrict(d, req);
        districts.save(d);
        replaceAddlDcps(d, req.getAddlDcp());

        return directory();
    }

    // Removes the district with its sub-divisions, stations and jurisdiction links
    @Transactional
    public PoliceDirectoryDto deleteDistrict(Long id) {

        PoliceDistrict d = districts.findById(id)
                .orElseThrow(() -> new NoSuchElementException("District not found"));

        List<PoliceSubDivision> subs = subDivisions.findByDistrict_Id(id);
        if (!subs.isEmpty()) {
            List<Long> subIds = subs.stream().map(PoliceSubDivision::getId).toList();
            consumerStations.deleteByPoliceStation_SubDivision_IdIn(subIds);
            drtStations.deleteByPoliceStation_SubDivision_IdIn(subIds);
            stations.deleteBySubDivision_IdIn(subs.stream().map(PoliceSubDivision::getId).toList());
            subDivisions.deleteAll(subs);
        }
        addlDcps.deleteByDistrict_Id(id);
        districts.delete(d);

        return directory();
    }

    // Copy request fields onto the district
    private void applyDistrict(PoliceDistrict d, PoliceRequests.DistrictRequest req) {

        d.setName(req.getName().trim());
        d.setPoliceRange(clean(req.getRange()));
        String policeCourt = clean(req.getCourt());
        d.setCourt(policeCourt == null ? null : courtService.requireCourt(policeCourt));
        d.setDefaultType(clean(req.getDefaultType()));
        d.setHq(clean(req.getHq()));

        PoliceRequests.Office dcp = req.getDcp() != null ? req.getDcp() : new PoliceRequests.Office();
        d.setDcpPost(clean(dcp.getPost()));
        d.setDcpAddress(clean(dcp.getAddress()));
        d.setDcpEmail(clean(dcp.getEmail()));
        d.setDcpPhone(clean(dcp.getPhone()));

        PoliceRequests.Office caw = req.getCaw() != null ? req.getCaw() : new PoliceRequests.Office();
        d.setCawPost(clean(caw.getPost()));
        d.setCawAddress(clean(caw.getAddress()));
        d.setCawEmail(clean(caw.getEmail()));
        d.setCawPhone(clean(caw.getPhone()));
    }

    // Replaces the district's additional DCP offices
    private void replaceAddlDcps(PoliceDistrict d, List<PoliceRequests.Office> rows) {

        if (rows == null) return;

        addlDcps.deleteByDistrict_Id(d.getId());
        addlDcps.flush();

        int order = 0;
        for (PoliceRequests.Office o : rows) {
            if (clean(o.getPost()) == null && clean(o.getAddress()) == null
                    && clean(o.getEmail()) == null && clean(o.getPhone()) == null) continue;

            addlDcps.save(PoliceAddlDcp.builder()
                    .district(d)
                    .post(clean(o.getPost()))
                    .address(clean(o.getAddress()))
                    .email(clean(o.getEmail()))
                    .phone(clean(o.getPhone()))
                    .sortOrder(order++)
                    .build());
        }
    }

    // Add a sub-division to a district
    @Transactional
    public PoliceDirectoryDto createSubDivision(PoliceRequests.SubDivisionRequest req) {

        PoliceDistrict district = districts.findById(req.getDistrictId())
                .orElseThrow(() -> new NoSuchElementException("District not found"));

        String acp = req.getAcp().trim();
        if (subDivisions.existsByDistrict_IdAndAcpIgnoreCase(district.getId(), acp)) {
            throw new IllegalArgumentException("\"" + acp + "\" already exists in " + district.getName());
        }

        PoliceSubDivision sd = new PoliceSubDivision();
        sd.setDistrict(district);
        sd.setSortOrder(nextSortOrder(subDivisions.findByDistrict_Id(district.getId()).stream()
                .map(PoliceSubDivision::getSortOrder)));
        applySubDivision(sd, req);
        subDivisions.save(sd);

        return directory();
    }

    // Edit or move a sub-division
    @Transactional
    public PoliceDirectoryDto updateSubDivision(Long id, PoliceRequests.SubDivisionRequest req) {

        PoliceSubDivision sd = subDivisions.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Sub-division not found"));

        PoliceDistrict district = districts.findById(req.getDistrictId())
                .orElseThrow(() -> new NoSuchElementException("District not found"));

        String acp = req.getAcp().trim();
        if (subDivisions.existsByDistrict_IdAndAcpIgnoreCaseAndIdNot(district.getId(), acp, id)) {
            throw new IllegalArgumentException("\"" + acp + "\" already exists in " + district.getName());
        }

        sd.setDistrict(district);
        applySubDivision(sd, req);
        subDivisions.save(sd);

        return directory();
    }

    // Also removes jurisdiction links of its stations
    @Transactional
    public PoliceDirectoryDto deleteSubDivision(Long id) {

        PoliceSubDivision sd = subDivisions.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Sub-division not found"));

        consumerStations.deleteByPoliceStation_SubDivision_Id(id);
        drtStations.deleteByPoliceStation_SubDivision_Id(id);
        stations.deleteBySubDivision_Id(id);
        subDivisions.delete(sd);

        return directory();
    }

    // Copy request fields onto the sub-division
    private void applySubDivision(PoliceSubDivision sd, PoliceRequests.SubDivisionRequest req) {
        sd.setAcp(req.getAcp().trim());
        sd.setAddress(clean(req.getAddress()));
        sd.setEmail(clean(req.getEmail()));
        sd.setPhone(clean(req.getPhone()));
    }

    // Add a station to a sub-division
    @Transactional
    public PoliceDirectoryDto createStation(PoliceRequests.StationRequest req) {

        PoliceSubDivision sd = subDivisions.findById(req.getSubDivisionId())
                .orElseThrow(() -> new NoSuchElementException("Sub-division not found"));

        String name = req.getName().trim();
        if (stations.existsBySubDivision_IdAndNameIgnoreCase(sd.getId(), name)) {
            throw new IllegalArgumentException("Police station \"" + name + "\" already exists in " + sd.getAcp());
        }

        PoliceStation ps = new PoliceStation();
        ps.setSubDivision(sd);
        ps.setSortOrder(nextSortOrder(stations.findAllByOrderBySortOrderAscIdAsc().stream()
                .filter(s -> s.getSubDivision().getId().equals(sd.getId()))
                .map(PoliceStation::getSortOrder)));
        applyStation(ps, req);
        stations.save(ps);

        return directory();
    }

    // Edit or move a station
    @Transactional
    public PoliceDirectoryDto updateStation(Long id, PoliceRequests.StationRequest req) {

        PoliceStation ps = stations.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Police station not found"));

        PoliceSubDivision sd = subDivisions.findById(req.getSubDivisionId())
                .orElseThrow(() -> new NoSuchElementException("Sub-division not found"));

        String name = req.getName().trim();
        if (stations.existsBySubDivision_IdAndNameIgnoreCaseAndIdNot(sd.getId(), name, id)) {
            throw new IllegalArgumentException("Police station \"" + name + "\" already exists in " + sd.getAcp());
        }

        ps.setSubDivision(sd);
        applyStation(ps, req);
        stations.save(ps);

        return directory();
    }

    // Also removes the station from consumer and DRT jurisdiction lists
    @Transactional
    public PoliceDirectoryDto deleteStation(Long id) {

        if (!stations.existsById(id)) throw new NoSuchElementException("Police station not found");
        consumerStations.deleteByPoliceStation_Id(id);
        drtStations.deleteByPoliceStation_Id(id);
        stations.deleteById(id);

        return directory();
    }

    // Copy request fields onto the station
    private void applyStation(PoliceStation ps, PoliceRequests.StationRequest req) {
        ps.setName(req.getName().trim());
        ps.setPhone(clean(req.getPhone()));
        ps.setEmail(clean(req.getEmail()));
        ps.setAddress(clean(req.getAddress()));
        ps.setPin(clean(req.getPin()));
    }

    // CAW headquarters details and footnote
    @Transactional
    public PoliceDirectoryDto updateSettings(PoliceRequests.SettingsRequest req) {

        put(KEY_CAW_POST,    req.getCawHqPost());
        put(KEY_CAW_ADDRESS, req.getCawHqAddress());
        put(KEY_CAW_NOTE,    req.getCawHqNote());
        put(KEY_SOURCE_NOTE, req.getSourceNote());

        return directory();
    }

    // Save a setting under its key
    private void put(String key, String value) {
        PoliceSetting s = settings.findById(key).orElseGet(() -> new PoliceSetting(key, null));
        s.setValue(clean(value));
        settings.save(s);
    }

    // Trim, empty or dash becomes null
    private static String clean(String s) {
        if (s == null) return null;
        String t = s.trim();
        return (t.isEmpty() || t.equals("—") || t.equals("-")) ? null : t;
    }

    // Next free sort position
    private static int nextSortOrder(java.util.stream.Stream<Integer> existing) {
        return existing.filter(Objects::nonNull).max(Integer::compare).orElse(-1) + 1;
    }
}
