package com.internyay.service;

import com.internyay.dto.JurisdictionDto;
import com.internyay.dto.JurisdictionRequests;
import com.internyay.entity.DrtStation;
import com.internyay.entity.DrtTribunal;
import com.internyay.entity.PoliceStation;
import com.internyay.repository.DrtStationRepository;
import com.internyay.repository.DrtTribunalRepository;
import com.internyay.repository.PoliceStationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

// Debts Recovery Tribunals and the police stations each one covers, edited by admin
@Service
@RequiredArgsConstructor
public class DrtJurisdictionService {

    private static final Set<String> KINDS =
            Set.of(DrtTribunal.BENCH, DrtTribunal.HIGH_VALUE, DrtTribunal.APPELLATE);

    private final DrtTribunalRepository tribunals;
    private final DrtStationRepository stations;
    private final PoliceStationRepository policeStations;

    // All tribunals with their linked police stations
    @Transactional(readOnly = true)
    public JurisdictionDto.Drt directory() {

        List<DrtTribunal> rows = tribunals.findAllByOrderBySortOrderAscIdAsc();

        Map<Long, List<PoliceStation>> linked = stations.findAllByOrderBySortOrderAscIdAsc().stream()
                .collect(Collectors.groupingBy(s -> s.getTribunal().getId(), LinkedHashMap::new,
                        Collectors.mapping(DrtStation::getPoliceStation, Collectors.toList())));

        List<JurisdictionDto.Tribunal> out = rows.stream()
                .map(t -> JurisdictionDto.Tribunal.builder()
                        .id(t.getId())
                        .kind(t.getKind())
                        .name(t.getName())
                        .location(t.getLocation())
                        .phone(t.getPhone())
                        .districtsLabel(t.getDistrictsLabel())
                        .amountLabel(t.getAmountLabel())
                        .jurisdictionText(t.getJurisdictionText())
                        .note(t.getNote())
                        .stations(linked.getOrDefault(t.getId(), List.of()).stream().map(PoliceStation::getName).toList())
                        .stationIds(linked.getOrDefault(t.getId(), List.of()).stream().map(PoliceStation::getId).toList())
                        .build())
                .toList();

        return JurisdictionDto.Drt.builder().tribunals(out).build();
    }

    // Add a tribunal, high value and appellate kinds can exist only once
    @Transactional
    public JurisdictionDto.Drt create(JurisdictionRequests.TribunalRequest req) {

        String kind = resolveKind(req.getKind());
        assertSingleton(kind, null);

        DrtTribunal t = new DrtTribunal();
        t.setKind(kind);
        t.setSortOrder(nextOrder(tribunals.findAll().stream().map(DrtTribunal::getSortOrder)));
        apply(t, req);
        tribunals.save(t);
        replaceStations(t, req.getStationIds());

        return directory();
    }

    // Edit a tribunal and replace its station list
    @Transactional
    public JurisdictionDto.Drt update(Long id, JurisdictionRequests.TribunalRequest req) {

        DrtTribunal t = tribunals.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Tribunal not found"));

        String kind = req.getKind() == null || req.getKind().isBlank() ? t.getKind() : resolveKind(req.getKind());
        assertSingleton(kind, id);

        t.setKind(kind);
        apply(t, req);
        tribunals.save(t);
        replaceStations(t, req.getStationIds());

        return directory();
    }

    // Remove a tribunal and its station links
    @Transactional
    public JurisdictionDto.Drt delete(Long id) {

        DrtTribunal t = tribunals.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Tribunal not found"));

        stations.deleteByTribunal_Id(id);
        tribunals.delete(t);

        return directory();
    }

    // BENCH is the default, otherwise BENCH, HIGH_VALUE or APPELLATE
    private String resolveKind(String raw) {
        String kind = raw == null || raw.isBlank() ? DrtTribunal.BENCH : raw.trim().toUpperCase();
        if (!KINDS.contains(kind)) {
            throw new IllegalArgumentException("Kind must be BENCH, HIGH_VALUE or APPELLATE");
        }
        return kind;
    }

    // High value and appellate tribunals are unique, benches are not
    private void assertSingleton(String kind, Long selfId) {
        if (DrtTribunal.BENCH.equals(kind)) return;
        boolean taken = selfId == null ? tribunals.existsByKind(kind) : tribunals.existsByKindAndIdNot(kind, selfId);
        if (taken) {
            throw new IllegalArgumentException("A " + kind + " tribunal already exists");
        }
    }

    // Copy the request fields onto the tribunal
    private void apply(DrtTribunal t, JurisdictionRequests.TribunalRequest req) {
        t.setName(req.getName().trim());
        t.setLocation(clean(req.getLocation()));
        t.setPhone(clean(req.getPhone()));
        t.setDistrictsLabel(clean(req.getDistrictsLabel()));
        t.setAmountLabel(clean(req.getAmountLabel()));
        t.setJurisdictionText(clean(req.getJurisdictionText()));
        t.setNote(clean(req.getNote()));
    }

    // Replace the linked stations with the given ids
    private void replaceStations(DrtTribunal t, List<Long> ids) {

        if (ids == null) return;

        List<Long> wanted = distinctIds(ids);
        Map<Long, PoliceStation> found = policeStations.findAllById(wanted).stream()
                .collect(Collectors.toMap(PoliceStation::getId, p -> p));
        if (found.size() != wanted.size()) {
            throw new IllegalArgumentException("One or more police stations are not in the police directory");
        }

        Map<Long, String> takenBy = new HashMap<>();
        for (DrtStation s : stations.findAllByOrderBySortOrderAscIdAsc()) {
            if (!s.getTribunal().getId().equals(t.getId())) {
                takenBy.put(s.getPoliceStation().getId(), s.getTribunal().getName());
            }
        }
        for (Long id : wanted) {
            String owner = takenBy.get(id);
            if (owner != null) {
                throw new IllegalArgumentException("\"" + found.get(id).getName() + "\" is already assigned to " + owner);
            }
        }

        stations.deleteByTribunal_Id(t.getId());
        stations.flush();

        int order = 0;
        for (Long id : wanted) {
            stations.save(DrtStation.builder().tribunal(t).policeStation(found.get(id)).sortOrder(order++).build());
        }
    }

    // Trim, empty becomes null
    private static String clean(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    // Drop nulls and duplicates
    private static List<Long> distinctIds(List<Long> raw) {
        return raw.stream().filter(Objects::nonNull).distinct().toList();
    }

    // Next free sort position
    private static int nextOrder(java.util.stream.Stream<Integer> orders) {
        return orders.max(Integer::compare).orElse(-1) + 1;
    }
}
