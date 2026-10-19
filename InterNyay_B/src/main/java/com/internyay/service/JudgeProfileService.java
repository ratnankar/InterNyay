package com.internyay.service;

import com.internyay.dto.JudgeProfileDto;
import com.internyay.dto.JudgeProfileRequest;
import com.internyay.dto.JudgeSeatDto;
import com.internyay.entity.DutyMagistrate;
import com.internyay.entity.Judge;
import com.internyay.entity.JudgeProfile;
import com.internyay.repository.DutyMagistrateRepository;
import com.internyay.repository.JudgeCourtNoRecordRepository;
import com.internyay.repository.JudgeProfileRepository;
import com.internyay.repository.JudgeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

// Judges (name and photo only). Where a judge sits is a listing, handled by JudgeService.
// Removing a judge never deletes court history: a judge with history is switched off instead
@Service
@RequiredArgsConstructor
public class JudgeProfileService {

    private static final int MAX_PHOTO_LENGTH = 2_000_000;

    private final JudgeProfileRepository profileRepo;
    private final JudgeRepository judgeRepo;
    private final JudgeCourtNoRecordRepository courtNoRepo;
    private final DutyMagistrateRepository dutyMagistrateRepo;

    // Every judge who can be picked, with the courts each holds now (none = not in any listing)
    public List<JudgeProfileDto> list() {
        Map<Long, List<String>> courts = judgeRepo.findAllSeats().stream()
                .collect(Collectors.groupingBy(JudgeSeatDto::profileId,
                        Collectors.mapping(s -> JudgeService.seatLabel(s.court(), s.district(), s.building(), s.floor(), s.courtRoomNo()),
                                Collectors.toList())));

        Map<Long, List<String>> courtNames = judgeRepo.findAllSeats().stream()
                .filter(s -> s.court() != null && !s.court().isBlank())
                .collect(Collectors.groupingBy(JudgeSeatDto::profileId,
                        Collectors.mapping(JudgeSeatDto::court, Collectors.collectingAndThen(Collectors.toCollection(java.util.LinkedHashSet::new), java.util.ArrayList::new))));

        Map<Long, List<JudgeSeatDto>> seats = judgeRepo.findAllSeats().stream()
                .collect(Collectors.groupingBy(JudgeSeatDto::profileId));

        return profileRepo.findByActiveTrueAndVacantFalseOrderByNameAsc().stream()
                .map(p -> JudgeProfileDto.from(p, courts.getOrDefault(p.getId(), List.of()), courtNames.getOrDefault(p.getId(), List.of()),
                        seats.getOrDefault(p.getId(), List.of())))
                .toList();
    }

    // Judge by id (switched off ones too) or 404
    public JudgeProfile get(Long id) {
        return profileRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Judge not found"));
    }

    // Judge who can be put in a listing: must not be switched off
    public JudgeProfile requireActive(Long id) {
        JudgeProfile p = get(id);
        if (!p.isActive() || p.isVacant()) throw new NoSuchElementException("Judge not found");
        return p;
    }

    // The special profile a court holds while it has no judge (created by migration V12)
    public JudgeProfile vacantProfile() {
        return profileRepo.findFirstByVacantTrue()
                .orElseThrow(() -> new IllegalStateException("The Vacant profile is missing, run the V12 migration"));
    }

    public JudgeProfileDto toDto(JudgeProfile p) {
        List<Judge> held = judgeRepo.findByProfileIdAndActiveTrue(p.getId());
        List<String> courts = held.stream()
                .map(j -> JudgeService.seatLabel(j.getCourt(), j.getDistrict(), j.getBuilding(), j.getFloor(), j.getCourtRoomNo()))
                .toList();
        List<String> courtNames = held.stream()
                .map(j -> j.getCourt()).filter(c -> c != null && !c.isBlank()).distinct().toList();
        List<JudgeSeatDto> seats = held.stream()
                .map(j -> new JudgeSeatDto(j.getId(), p.getId(), p.getName(), j.getCourt(), j.getDistrict(), j.getBuilding(), j.getFloor(), j.getCourtRoomNo()))
                .toList();
        return JudgeProfileDto.from(p, courts, courtNames, seats);
    }

    // Add a judge
    @Transactional
    public JudgeProfile create(JudgeProfileRequest req) {
        return createOrRestore(req.getName(), req.getPhoto());
    }

    // Add a judge, or switch a removed judge with the same name back on (their old history is then theirs again).
    // A judge who is already in the list is refused, the admin should pick that judge instead
    @Transactional
    public JudgeProfile createOrRestore(String name, String photo) {
        String clean = cleanName(name);
        if (JudgeProfile.keyOf(clean).equals("vacant")) {
            throw new IllegalArgumentException("\"Vacant\" is reserved for a court without a judge. Use the Court vacant option in Change judge");
        }
        List<JudgeProfile> same = profileRepo.findByNameKey(JudgeProfile.keyOf(clean));

        if (same.stream().anyMatch(JudgeProfile::isActive)) {
            throw new IllegalArgumentException("\"" + clean + "\" is already in the Judges list. Choose that judge instead of adding again");
        }

        JudgeProfile profile = same.isEmpty() ? new JudgeProfile() : same.get(0);
        profile.setName(clean);
        profile.setActive(true);
        String cleaned = cleanPhoto(photo);
        if (cleaned != null || same.isEmpty()) profile.setPhoto(cleaned);
        return profileRepo.save(profile);
    }

    // Edit a judge's name and photo. A corrected name shows in the court history too, it is read from the judge
    @Transactional
    public JudgeProfile update(Long id, JudgeProfileRequest req) {
        JudgeProfile profile = requireActive(id);

        String clean = cleanName(req.getName());
        boolean taken = profileRepo.findByNameKey(JudgeProfile.keyOf(clean)).stream()
                .anyMatch(p -> p.isActive() && !p.getId().equals(id));
        if (taken) {
            throw new IllegalArgumentException("\"" + clean + "\" is already in the Judges list");
        }

        String oldName = profile.getName();
        profile.setName(clean);
        // null keeps the photo, blank removes it, anything else replaces it
        if (req.getPhoto() != null) profile.setPhoto(cleanPhoto(req.getPhoto()));
        JudgeProfile saved = profileRepo.save(profile);

        // Duty magistrate rows copy the judge's details, so they are refreshed
        for (Judge listing : judgeRepo.findByProfileIdAndActiveTrue(id)) {
            // Only rows saved for this judge and still running: rows of an earlier judge of the court, or whose duty
            // ended, keep what they were saved with
            LocalDate today = LocalDate.now();
            List<DutyMagistrate> linked = dutyMagistrateRepo.findByJudgeId(listing.getId()).stream()
                    .filter(d -> d.getJudgeName() == null || d.getJudgeName().equalsIgnoreCase(oldName))
                    .filter(d -> d.getTillDate() == null || Boolean.TRUE.equals(d.getFurtherOrder()) || !d.getTillDate().isBefore(today))
                    .toList();
            linked.forEach(d -> d.applyJudge(listing));
            dutyMagistrateRepo.saveAll(linked);
        }
        return saved;
    }

    // Remove a judge. A judge who still holds a court cannot be removed (a listing always has a judge): change its judge first.
    // A judge with any history is switched off and kept, only a judge who never sat anywhere is deleted
    @Transactional
    public void delete(Long id) {
        JudgeProfile profile = requireActive(id);

        if (!judgeRepo.findByProfileIdAndActiveTrue(id).isEmpty()) {
            throw new IllegalArgumentException(profile.getName()
                    + " still holds a court. Use Change judge on that court first, then remove this judge");
        }

        boolean hasHistory = judgeRepo.existsByProfileId(id) || courtNoRepo.existsByProfileId(id);
        if (hasHistory) {
            profile.setActive(false);
            profileRepo.save(profile);
        } else {
            profileRepo.delete(profile);
        }
    }

    // Name with the spaces collapsed, required
    private String cleanName(String name) {
        String clean = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        if (clean.isEmpty()) throw new IllegalArgumentException("Judge name is required");
        return clean;
    }

    // Blank becomes null, anything else must be an image smaller than 2MB
    public String cleanPhoto(String photo) {
        if (photo == null || photo.isBlank()) return null;
        if (!photo.startsWith("data:image/") || photo.length() > MAX_PHOTO_LENGTH) {
            throw new IllegalArgumentException("Photo must be an image smaller than 2MB");
        }
        return photo;
    }

}
