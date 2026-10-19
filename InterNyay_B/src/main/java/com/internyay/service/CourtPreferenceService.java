package com.internyay.service;

import com.internyay.dto.CourtPreferenceDto;
import com.internyay.entity.Court;
import com.internyay.entity.User;
import com.internyay.repository.CaseRepository;
import com.internyay.repository.CourtRepository;
import com.internyay.repository.UserRepository;
import com.internyay.util.CourtPreferences;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

// The courts a user works at. The app opens Judges on Leave, the judge list, duty magistrate, bail roster, the police
// directory and the Add Case form on these courts. With no preference set, the courts that have the most cases are used
@Service
@RequiredArgsConstructor
public class CourtPreferenceService {

    private final CourtRepository courtRepo;
    private final CaseRepository caseRepo;
    private final UserRepository userRepo;

    // A court a preference can point at: a high court, or a district under a court complex.
    // Building and court no. rows are details of such a court, not courts of their own
    private static boolean isPlace(Court c) {
        return c.getBuilding().isEmpty() && c.getFloor().isEmpty() && c.getCourtNo().isEmpty()
                && (c.isHighCourt() || !c.getDistrict().isEmpty());
    }

    // Current preference of an account. dataOwnerId is whose cases are counted (an associate counts its advocate's cases)
    @Transactional(readOnly = true)
    public CourtPreferenceDto get(User account, Long dataOwnerId) {
        return build(CourtPreferences.parse(account.getCourtPreferences()), dataOwnerId);
    }

    // Saves the chosen courts. Unknown ids and rows that are not a court are refused; an empty list clears the preference
    @Transactional
    public CourtPreferenceDto save(Long accountId, Long dataOwnerId, List<Long> requested) {
        User account = userRepo.findById(accountId).orElseThrow(() -> new NoSuchElementException("Account not found"));

        List<Long> ids = requested == null ? List.of() : requested.stream()
                .filter(Objects::nonNull).distinct().toList();
        if (ids.size() > CourtPreferences.MAX) {
            throw new IllegalArgumentException("Choose at most " + CourtPreferences.MAX + " courts");
        }

        Map<Long, Court> places = new HashMap<>();
        for (Court c : courtRepo.findAllByOrderByIdAsc()) if (isPlace(c)) places.put(c.getId(), c);
        for (Long id : ids) {
            if (!places.containsKey(id)) throw new IllegalArgumentException("Unknown court selected");
        }

        account.setCourtPreferences(CourtPreferences.join(ids));
        userRepo.save(account);
        return build(new ArrayList<>(ids), dataOwnerId);
    }

    // Courts to use by default: the chosen ones (or, with none chosen, every court that has cases),
    // the court with the most cases first. Equal counts keep the order the user chose them in
    private CourtPreferenceDto build(List<Long> saved, Long dataOwnerId) {
        List<Court> table = courtRepo.findAllByOrderByIdAsc();
        Map<Long, Court> places = new LinkedHashMap<>();
        for (Court c : table) if (isPlace(c)) places.put(c.getId(), c);

        // Chosen courts that still exist (the admin may have removed one since)
        List<Long> chosen = saved.stream().filter(places::containsKey).toList();

        // Choosing a court means all of its districts, including ones the admin adds later, so every
        // district row of a chosen court is included (high courts have no districts and stay as chosen)
        Set<String> chosenCourts = new HashSet<>();
        for (Long id : chosen) {
            Court c = places.get(id);
            if (!c.isHighCourt()) chosenCourts.add(c.getCourt());
        }
        Set<Long> expanded = new LinkedHashSet<>(chosen);
        for (Court c : places.values()) {
            if (!c.isHighCourt() && chosenCourts.contains(c.getCourt())) expanded.add(c.getId());
        }
        List<Long> valid = new ArrayList<>(expanded);

        // Cases per court + district
        Map<String, Long> counts = new HashMap<>();
        for (Object[] row : caseRepo.countByCourtAndDistrict(dataOwnerId)) {
            counts.put(key((String) row[0], (String) row[1]), ((Number) row[2]).longValue());
        }

        List<CourtPreferenceDto.Place> list = new ArrayList<>();
        if (!valid.isEmpty()) {
            for (Long id : valid) list.add(place(places.get(id), counts));
        } else {
            for (Court c : places.values()) {
                CourtPreferenceDto.Place p = place(c, counts);
                if (p.cases > 0) list.add(p);
            }
        }
        // sort is stable, so equal counts stay in their original order
        list.sort(Comparator.comparingLong((CourtPreferenceDto.Place p) -> p.cases).reversed());

        return CourtPreferenceDto.builder()
                .saved(valid)
                .custom(!valid.isEmpty())
                .effective(list)
                .defaultId(list.isEmpty() ? null : list.get(0).id)
                .build();
    }

    private static CourtPreferenceDto.Place place(Court c, Map<String, Long> counts) {
        return CourtPreferenceDto.Place.builder()
                .id(c.getId()).court(c.getCourt()).district(c.getDistrict())
                .cases(counts.getOrDefault(key(c.getCourt(), c.getDistrict()), 0L))
                .build();
    }

    private static String key(String court, String district) {
        return (court == null ? "" : court) + "\u0000" + (district == null ? "" : district);
    }
}
