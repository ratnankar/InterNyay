package com.internyay.service;

import com.internyay.dto.JurisdictionDto;
import com.internyay.dto.JurisdictionRequests;
import com.internyay.entity.ConsumerCommission;
import com.internyay.entity.ConsumerStation;
import com.internyay.entity.PoliceStation;
import com.internyay.repository.ConsumerCommissionRepository;
import com.internyay.repository.ConsumerStationRepository;
import com.internyay.repository.PoliceStationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

// Consumer commissions and their police station jurisdiction, edited by admin
@Service
@RequiredArgsConstructor
public class ConsumerJurisdictionService {

    private static final Set<String> KINDS =
            Set.of(ConsumerCommission.DISTRICT, ConsumerCommission.STATE, ConsumerCommission.NATIONAL);

    private final ConsumerCommissionRepository commissions;
    private final ConsumerStationRepository stations;
    private final PoliceStationRepository policeStations;

    // All commissions with their linked police stations
    @Transactional(readOnly = true)
    public JurisdictionDto.Consumer directory() {

        Map<Long, List<PoliceStation>> linked = stations.findAllByOrderBySortOrderAscIdAsc().stream()
                .collect(Collectors.groupingBy(s -> s.getCommission().getId(), LinkedHashMap::new,
                        Collectors.mapping(ConsumerStation::getPoliceStation, Collectors.toList())));

        List<JurisdictionDto.Commission> out = commissions.findAllByOrderBySortOrderAscIdAsc().stream()
                .map(c -> JurisdictionDto.Commission.builder()
                        .id(c.getId())
                        .kind(c.getKind())
                        .name(c.getName())
                        .location(c.getLocation())
                        .stations(linked.getOrDefault(c.getId(), List.of()).stream().map(PoliceStation::getName).toList())
                        .stationIds(linked.getOrDefault(c.getId(), List.of()).stream().map(PoliceStation::getId).toList())
                        .build())
                .toList();

        return JurisdictionDto.Consumer.builder().commissions(out).build();
    }

    // Add a commission, STATE and NATIONAL can exist only once
    @Transactional
    public JurisdictionDto.Consumer create(JurisdictionRequests.CommissionRequest req) {

        String kind = resolveKind(req.getKind());
        assertSingleton(kind, null);

        ConsumerCommission c = new ConsumerCommission();
        c.setKind(kind);
        c.setSortOrder(nextOrder(commissions.findAll().stream().map(ConsumerCommission::getSortOrder)));
        apply(c, req);
        commissions.save(c);
        replaceStations(c, req.getStationIds());

        return directory();
    }

    // Edit a commission and replace its station list
    @Transactional
    public JurisdictionDto.Consumer update(Long id, JurisdictionRequests.CommissionRequest req) {

        ConsumerCommission c = commissions.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Commission not found"));

        String kind = req.getKind() == null || req.getKind().isBlank() ? c.getKind() : resolveKind(req.getKind());
        assertSingleton(kind, id);

        c.setKind(kind);
        apply(c, req);
        commissions.save(c);
        replaceStations(c, req.getStationIds());

        return directory();
    }

    // Remove a commission and its station links
    @Transactional
    public JurisdictionDto.Consumer delete(Long id) {

        ConsumerCommission c = commissions.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Commission not found"));

        stations.deleteByCommission_Id(id);
        commissions.delete(c);

        return directory();
    }

    // DISTRICT is the default, otherwise DISTRICT, STATE or NATIONAL
    private String resolveKind(String raw) {
        String kind = raw == null || raw.isBlank() ? ConsumerCommission.DISTRICT : raw.trim().toUpperCase();
        if (!KINDS.contains(kind)) {
            throw new IllegalArgumentException("Kind must be DISTRICT, STATE or NATIONAL");
        }
        return kind;
    }

    // State and national commissions are unique, districts are not
    private void assertSingleton(String kind, Long selfId) {
        if (ConsumerCommission.DISTRICT.equals(kind)) return;
        boolean taken = selfId == null ? commissions.existsByKind(kind) : commissions.existsByKindAndIdNot(kind, selfId);
        if (taken) {
            throw new IllegalArgumentException("A " + kind + " commission already exists");
        }
    }

    // Copy the request fields onto the commission
    private void apply(ConsumerCommission c, JurisdictionRequests.CommissionRequest req) {
        c.setName(req.getName().trim());
        c.setLocation(clean(req.getLocation()));
    }

    // Replace the linked stations with the given ids, keeping the order given
    private void replaceStations(ConsumerCommission c, List<Long> ids) {

        if (ids == null) return;

        List<Long> wanted = distinctIds(ids);
        Map<Long, PoliceStation> found = policeStations.findAllById(wanted).stream()
                .collect(Collectors.toMap(PoliceStation::getId, p -> p));
        if (found.size() != wanted.size()) {
            throw new IllegalArgumentException("One or more police stations are not in the police directory");
        }

        stations.deleteByCommission_Id(c.getId());
        stations.flush();

        int order = 0;
        for (Long id : wanted) {
            stations.save(ConsumerStation.builder().commission(c).policeStation(found.get(id)).sortOrder(order++).build());
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
