package com.internyay.service;

import com.internyay.dto.CourtNoLogDto;
import com.internyay.dto.CourtNoRecordDto;
import com.internyay.dto.CourtNoRecordRequest;
import com.internyay.dto.JudgeChangeRequest;
import com.internyay.dto.JudgeCourtNoDto;
import com.internyay.dto.JudgeSeatDto;
import com.internyay.dto.JudgeDto;
import com.internyay.dto.JudgeRequest;
import com.internyay.entity.Court;
import com.internyay.entity.Case;
import com.internyay.entity.DutyMagistrate;
import com.internyay.entity.Judge;
import com.internyay.entity.JudgeCourtNoRecord;
import com.internyay.entity.JudgeProfile;
import com.internyay.repository.CourtRepository;
import com.internyay.repository.JudgeCourtNoRecordRepository;
import com.internyay.repository.DutyMagistrateRepository;
import com.internyay.repository.JudgeRepository;
import com.internyay.repository.JudgeProfileRepository;
import com.internyay.util.CourtMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;

// Judges List listings (court seats): add, edit, remove, change the judge, search and court number lookups.
// The judge's name and photo are handled by JudgeProfileService. Nothing here deletes court history
@Service
@RequiredArgsConstructor
public class JudgeService {

    private static final Comparator<JudgeCourtNoRecord> NEWEST_FIRST =
            Comparator.comparing(JudgeCourtNoRecord::getFromDate).thenComparing(JudgeCourtNoRecord::getId).reversed();

    private final JudgeRepository judgeRepo;
    private final DutyMagistrateRepository dutyMagistrateRepo;
    private final JudgeCourtNoRecordRepository courtNoRepo;
    private final JudgeProfileRepository profileRepo;
    private final JudgeProfileService profileService;
    private final CourtService courtService;
    private final CourtNoTransferService courtNoTransfer;
    private final CourtRepository courtRepo;

    // Optional court / district filters
    public List<Judge> list(String court, String district) {
        return judgeRepo.findByFilters(blankToNull(court), blankToNull(district));
    }

    // Type-ahead: every typed word must appear in the name
    public List<Judge> search(String q, String court, String district, int limit) {
        String text = blankToNull(q);
        if (text == null) return List.of();

        String phrase = text.toLowerCase();
        List<String> tokens = Arrays.asList(phrase.split("\\s+"));

        return judgeRepo.searchByName("%" + tokens.get(0) + "%", blankToNull(court), blankToNull(district))
                .stream()
                .filter(j -> j.getName() != null && containsAll(j.getName().toLowerCase(), tokens))
                .sorted(Comparator.comparing((Judge j) -> !j.getName().toLowerCase().startsWith(phrase)))
                .limit(Math.max(1, Math.min(limit, 50)))
                .toList();
    }

    // Court numbers with their judge for a court
    public List<JudgeCourtNoDto> courtNumbers(String court, String district) {
        return judgeRepo.findCourtNumbers(blankToNull(court), blankToNull(district));
    }

    // Matches cases to judges through court and court number
    public Map<Long, String> judgeNamesFor(Collection<Case> cases) {

        Map<String, List<JudgeCourtNoDto>> directory = new HashMap<>();
        Map<Long, String> names = new HashMap<>();

        for (Case c : cases) {
            if (c.getCourt() == null || CourtMatch.courtNo(c.getCourtNo()) == null) continue;

            List<JudgeCourtNoDto> judges = directory.computeIfAbsent(
                    c.getCourt() + "|" + c.getDistrict(),
                    k -> judgeRepo.findCourtNumbers(c.getCourt(), c.getDistrict()));

            judges.stream()
                    .filter(j -> CourtMatch.sameCourtNo(c.getCourtNo(), j.courtRoomNo()))
                    .map(JudgeCourtNoDto::judgeName)
                    .findFirst()
                    .ifPresent(name -> names.put(c.getId(), name));
        }

        return names;
    }

    // True when the name contains every token
    private boolean containsAll(String name, List<String> tokens) {
        return tokens.stream().allMatch(name::contains);
    }

    // Listing by id (removed ones too) or 404
    public Judge get(Long id) {
        return judgeRepo.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Listing not found"));
    }

    // Listing that has not been removed, or 404
    public Judge getActive(Long id) {
        Judge listing = get(id);
        if (!listing.isActive()) throw new NoSuchElementException("Listing not found");
        return listing;
    }

    public JudgeDto toDto(Judge judge) {
        return toDtos(List.of(judge), true).get(0);
    }

    // Judges with their court history only when asked for, otherwise an empty history.
    // Every judge also carries the number of courts the same judge holds and the other courts
    public List<JudgeDto> toDtos(List<Judge> judges, boolean includeHistory) {
        if (judges.isEmpty()) return List.of();

        Map<Long, List<CourtNoRecordDto>> history = Map.of();
        if (includeHistory) {
            List<Long> ids = judges.stream().map(Judge::getId).toList();
            history = courtNoRepo.findByJudgeIdIn(ids).stream()
                    .sorted(NEWEST_FIRST)
                    .collect(Collectors.groupingBy(JudgeCourtNoRecord::getJudgeId,
                            Collectors.mapping(CourtNoRecordDto::from, Collectors.toList())));
        }

        // The same judge in several courts is several listings with the same judge
        Map<Long, List<JudgeSeatDto>> seatsByJudge = judgeRepo.findAllSeats().stream()
                .collect(Collectors.groupingBy(JudgeSeatDto::profileId));

        Map<Long, List<CourtNoRecordDto>> historyById = history;
        Set<String> mahilaRooms = courtRepo.findByMahilaCourtTrue().stream()
                .map(r -> roomKey(r.getCourt(), r.getDistrict(), r.getBuilding(), r.getCourtNo()))
                .collect(Collectors.toSet());
        return judges.stream().map(j -> {
            // Vacant courts share one profile, but that is not "one judge holding many courts"
            List<JudgeSeatDto> seats = j.getProfile().isVacant() ? List.of()
                    : seatsByJudge.getOrDefault(j.getProfile().getId(), List.of());
            List<String> others = seats.stream()
                    .filter(s -> !s.id().equals(j.getId()))
                    .map(s -> seatLabel(s.court(), s.district(), s.building(), s.courtRoomNo()))
                    .toList();
            return JudgeDto.from(j, historyById.getOrDefault(j.getId(), List.of())).toBuilder()
                    .courtCount(others.size() + 1)
                    .otherCourts(others)
                    .mahilaCourt(mahilaRooms.contains(roomKey(j.getCourt(), j.getDistrict(), j.getBuilding(), j.getCourtRoomNo())))
                    .build();
        }).toList();
    }

    private static String roomKey(String court, String district, String building, String courtNo) {
        String no = CourtMatch.courtNo(courtNo);
        if (no == null) return "";
        return String.join("|", norm(court), norm(district), norm(building), no);
    }

    private static String norm(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    // "Saket · Court No. 12" style text for a court seat
    static String seatLabel(String court, String district, String building, String courtNo) {
        StringBuilder sb = new StringBuilder();
        if (district != null && !district.isBlank() && !district.equalsIgnoreCase(court)) sb.append(district).append(" · ");
        sb.append(court == null ? "" : court);
        if (building != null && !building.isBlank()) sb.append(" · Building ").append(building);
        if (courtNo != null && !courtNo.isBlank()) sb.append(" · Court No. ").append(courtNo);
        return sb.toString();
    }

    // History of court numbers for a court and district: every judge who sat in each court number and when.
    // Each period is filed under the court and district saved on that period
    public List<CourtNoLogDto> courtNoLog(String court, String district) {
        // Removed listings stay here on purpose: their court history is kept
        Map<Long, Judge> judges = judgeRepo.findAll().stream().collect(Collectors.toMap(Judge::getId, j -> j));
        if (judges.isEmpty()) return List.of();

        Map<Long, JudgeProfile> profiles = profileRepo.findAll().stream().collect(Collectors.toMap(JudgeProfile::getId, p -> p));

        String wantedCourt = blankToNull(court);
        String wantedDistrict = blankToNull(district);

        return courtNoRepo.findByJudgeIdIn(judges.keySet()).stream()
                .sorted(NEWEST_FIRST)
                .map(r -> {
                    CourtNoRecordDto d = CourtNoRecordDto.from(r);
                    Judge j = judges.get(r.getJudgeId());
                    JudgeProfile sat = r.getProfileId() == null ? null : profiles.get(r.getProfileId());
                    String who = sat != null ? sat.getName()
                            : blankToNull(r.getJudgeName()) != null ? r.getJudgeName() : j.getName();
                    return new CourtNoLogDto(r.getId(), j.getId(), who, j.getDesignation(),
                            d.court(), d.district(), blankToNull(r.getBuilding()),
                            r.getCourtRoomNo(), r.getFromDate(), r.getTillDate(), r.getTillDate() == null);
                })
                .filter(l -> wantedCourt == null || wantedCourt.equalsIgnoreCase(l.court()))
                .filter(l -> wantedDistrict == null || wantedDistrict.equalsIgnoreCase(l.district()))
                .toList();
    }

    public List<CourtNoRecordDto> courtNoHistory(Long judgeId) {
        get(judgeId);
        return courtNoRepo.findByJudgeId(judgeId).stream()
                .sorted(NEWEST_FIRST)
                .map(CourtNoRecordDto::from)
                .toList();
    }

    // Court table row for a history period: its own court and district when given, otherwise the judge's.
    // Court, district, building and court no. must all be in the court table
    private Court placeForPeriod(Judge judge, CourtNoRecordRequest req) {
        String court = blankToNull(req.getCourt()) != null ? req.getCourt() : judge.getCourt();
        String district = blankToNull(req.getCourt()) != null ? req.getDistrict() : judge.getDistrict();
        return courtService.requirePlace(court, district, req.getBuilding(), req.getCourtRoomNo());
    }

    @Transactional
    public List<CourtNoRecordDto> addPastCourtNo(Long judgeId, CourtNoRecordRequest req) {
        Judge judge = get(judgeId);
        validateInterval(judgeId, null, req);
        Court place = placeForPeriod(judge, req);
        courtNoRepo.save(JudgeCourtNoRecord.builder()
                .judgeId(judgeId)
                .courtRoomNo(place.getCourtNo())
                .fromDate(req.getFromDate())
                .tillDate(req.getTillDate())
                .building(blankToNull(place.getBuilding()))
                .court(blankToNull(place.getCourt()))
                .district(blankToNull(place.getDistrict()))
                .judgeName(judge.getName())
                .profileId(judge.getProfile().getId())
                .build());
        return courtNoHistory(judgeId);
    }

    // Edit a period. The current period is the judge's own court number, so the judge follows the change
    @Transactional
    public List<CourtNoRecordDto> updateCourtNo(Long judgeId, Long recordId, CourtNoRecordRequest req) {
        JudgeCourtNoRecord record = periodOf(judgeId, recordId);
        Judge owner = get(judgeId);
        if (record.getTillDate() == null) {
            return updateCurrentPeriod(owner, record, req);
        }
        validateInterval(judgeId, recordId, req);
        Court place = placeForPeriod(owner, req);
        record.setCourtRoomNo(place.getCourtNo());
        record.setFromDate(req.getFromDate());
        record.setTillDate(req.getTillDate());
        record.setBuilding(blankToNull(place.getBuilding()));
        record.setCourt(blankToNull(place.getCourt()));
        record.setDistrict(blankToNull(place.getDistrict()));
        courtNoRepo.save(record);
        return courtNoHistory(judgeId);
    }

    // Delete a period. Deleting the current one leaves the judge without a court number until one is set again
    @Transactional
    public List<CourtNoRecordDto> deleteCourtNo(Long judgeId, Long recordId) {
        JudgeCourtNoRecord record = periodOf(judgeId, recordId);
        courtNoRepo.delete(record);
        if (record.getTillDate() == null) {
            Judge judge = get(judgeId);
            judge.setCourtRoomNo(null);
            judge.setBuilding(null);
            judge.setUpdatedAt(LocalDateTime.now());
            judgeRepo.save(judge);
            syncDutyMagistrates(judge);
        }
        return courtNoHistory(judgeId);
    }

    private JudgeCourtNoRecord periodOf(Long judgeId, Long recordId) {
        return courtNoRepo.findById(recordId)
                .filter(r -> r.getJudgeId().equals(judgeId))
                .orElseThrow(() -> new NoSuchElementException("Court number record not found"));
    }

    // Change the open period and copy the new place onto the judge, so both always agree
    private List<CourtNoRecordDto> updateCurrentPeriod(Judge judge, JudgeCourtNoRecord record, CourtNoRecordRequest req) {
        for (JudgeCourtNoRecord other : courtNoRepo.findByJudgeId(judge.getId())) {
            if (other.getId().equals(record.getId())) continue;
            // The day a judge is changed can belong to both judges, so sharing exactly the boundary day is allowed
            if (other.getTillDate() != null && req.getFromDate().isBefore(other.getTillDate())) {
                throw new IllegalArgumentException("The start date overlaps the period of court number " + other.getCourtRoomNo());
            }
        }
        Court place = placeForPeriod(judge, req);
        if (placeChanged(judge, place)) requireSeatFree(place, judge.getId());
        record.setCourtRoomNo(place.getCourtNo());
        record.setFromDate(req.getFromDate());
        record.setBuilding(blankToNull(place.getBuilding()));
        record.setCourt(blankToNull(place.getCourt()));
        record.setDistrict(blankToNull(place.getDistrict()));
        courtNoRepo.save(record);

        judge.setCourt(place.getCourt());
        judge.setDistrict(place.getDistrict());
        judge.setCourtId(courtService.listingBaseOf(place.getCourt(), place.getDistrict()).getId());
        judge.setCourtRoomNo(blankToNull(place.getCourtNo()));
        judge.setBuilding(blankToNull(place.getBuilding()));
        judge.setUpdatedAt(LocalDateTime.now());
        judgeRepo.save(judge);
        syncDutyMagistrates(judge);
        return courtNoHistory(judge.getId());
    }

    private void validateInterval(Long judgeId, Long ignoreId, CourtNoRecordRequest req) {
        if (req.getTillDate() == null) {
            throw new IllegalArgumentException("Till date is required");
        }
        if (req.getTillDate().isBefore(req.getFromDate())) {
            throw new IllegalArgumentException("Till date cannot be before the from date");
        }
        for (JudgeCourtNoRecord other : courtNoRepo.findByJudgeId(judgeId)) {
            if (other.getId().equals(ignoreId)) continue;
            // Sharing exactly one boundary day (the day a judge was changed) is allowed
            boolean startsBeforeOtherEnds = other.getTillDate() == null || req.getFromDate().isBefore(other.getTillDate());
            boolean endsAfterOtherStarts = req.getTillDate().isAfter(other.getFromDate());
            if (startsBeforeOtherEnds && endsAfterOtherStarts) {
                throw new IllegalArgumentException("These dates overlap the period of court number " + other.getCourtRoomNo());
            }
        }
    }

    // The court table row a judge request points at. Court, building and court no. must be in the court table.
    // The district is optional: with one, a court no. that has no district yet moves into it and one that is already
    // there stays; without one, nothing in the court table is changed
    private Court requirePlace(JudgeRequest req) {
        String court = courtService.requireCourt(req.getCourt());
        if (courtService.highCourt(court).isPresent()) {
            throw new IllegalArgumentException(court + " is a high court. Listings are for district courts");
        }
        String district = blankToNull(req.getDistrict());
        if (district != null) district = courtService.requireDistrictOf(court, district);
        return courtNoTransfer.resolveForListing(court, district, req.getBuilding(), req.getCourtRoomNo());
    }

    private void trackCourtNo(Judge judge, LocalDate requestedFrom, boolean correction) {
        String newNo = judge.getCourtRoomNo();
        Optional<JudgeCourtNoRecord> open =
                courtNoRepo.findFirstByJudgeIdAndTillDateIsNullOrderByFromDateDesc(judge.getId());

        String court = blankToNull(judge.getCourt());
        String district = blankToNull(judge.getDistrict());

        if (open.isPresent() && open.get().getCourtRoomNo().equalsIgnoreCase(newNo == null ? "" : newNo.trim())
                && samePlace(open.get(), court, district)) {
            // Same court number in the same court and district, but the building may have been corrected
            JudgeCourtNoRecord same = open.get();
            String building = blankToNull(judge.getBuilding());
            boolean changed = false;
            if (!Objects.equals(building, same.getBuilding())) { same.setBuilding(building); changed = true; }
            if (changed) courtNoRepo.save(same);
            return;
        }
        if (open.isEmpty() && newNo == null) return;

        // A correction replaces the current period in place, so the wrong value leaves nothing behind in the history
        if (correction && open.isPresent()) {
            JudgeCourtNoRecord current = open.get();
            if (newNo == null) {
                courtNoRepo.delete(current);
                return;
            }
            current.setCourtRoomNo(newNo);
            current.setBuilding(blankToNull(judge.getBuilding()));
            current.setCourt(court);
            current.setDistrict(district);
            courtNoRepo.save(current);
            return;
        }

        LocalDate effective = requestedFrom != null ? requestedFrom : LocalDate.now();

        if (open.isPresent()) {
            JudgeCourtNoRecord current = open.get();
            if (effective.isBefore(current.getFromDate())) {
                throw new IllegalArgumentException(
                        "Effective date cannot be before the current court number started on " + current.getFromDate());
            }
            // The old period needs at least one day of its own to stay in the history
            if (effective.equals(current.getFromDate())) {
                throw new IllegalArgumentException(
                        "The current court number started on " + current.getFromDate()
                        + ". Choose a later effective date to keep it in the history, or mark this as a correction to replace it");
            }
            current.setTillDate(effective.minusDays(1));
            courtNoRepo.save(current);
        }

        if (newNo != null) {
            courtNoRepo.save(JudgeCourtNoRecord.builder()
                    .judgeId(judge.getId())
                    .courtRoomNo(newNo)
                    .fromDate(effective)
                    .building(blankToNull(judge.getBuilding()))
                    .court(court)
                    .district(district)
                    .judgeName(judge.getName())
                    .profileId(judge.getProfile().getId())
                    .build());
        }
    }

    // True when the open period is in this court and district
    private boolean samePlace(JudgeCourtNoRecord record, String court, String district) {
        return record.getCourt().equalsIgnoreCase(court == null ? "" : court)
                && Objects.equals(blankToNull(record.getDistrict()) == null ? null : record.getDistrict().toLowerCase(),
                                  district == null ? null : district.toLowerCase());
    }

    // Add a listing. It always has a judge: an existing one (judgeId) or a new one (newJudgeName), who is added to the Judges list
    @Transactional
    public Judge create(JudgeRequest req) {
        Court place = requirePlace(req);
        requireSeatFree(place, null);

        JudgeProfile judge;
        if (req.getJudgeId() != null) {
            judge = profileService.requireActive(req.getJudgeId());
        } else if (blankToNull(req.getNewJudgeName()) != null) {
            judge = profileService.createOrRestore(req.getNewJudgeName(), req.getNewJudgePhoto());
        } else {
            throw new IllegalArgumentException("Choose a judge for this listing or add a new one");
        }

        Judge listing = new Judge();
        listing.setCreatedAt(LocalDateTime.now());
        listing.setProfile(judge);
        applyText(listing, req, place);
        Judge saved = judgeRepo.save(listing);
        trackCourtNo(saved, req.getCourtNoFrom(), false);
        return saved;
    }

    // Edit a listing and push the change to linked duty magistrate entries. The judge of the listing is not changed here
    @Transactional
    public Judge update(Long id, JudgeRequest req) {
        Court place = requirePlace(req);
        Judge listing = getActive(id);
        if (placeChanged(listing, place)) requireSeatFree(place, id);
        applyText(listing, req, place);
        listing.setUpdatedAt(LocalDateTime.now());
        Judge saved = judgeRepo.save(listing);
        trackCourtNo(saved, req.getCourtNoFrom(), Boolean.TRUE.equals(req.getCourtNoCorrection()));
        syncDutyMagistrates(saved);
        return saved;
    }

    // True when the court, building or court no. of the place is not the judge's current one
    private boolean placeChanged(Judge judge, Court place) {
        Long courtId = courtService.listingBaseOf(place.getCourt(), place.getDistrict()).getId();
        return !Objects.equals(judge.getCourtId(), courtId)
                || !Objects.equals(blankToNull(judge.getCourtRoomNo()), blankToNull(place.getCourtNo()))
                || !Objects.equals(blankToNull(judge.getBuilding()), blankToNull(place.getBuilding()));
    }

    // One court can have only one judge: refuses a court room that another judge row already holds
    private void requireSeatFree(Court place, Long ignoreId) {
        String no = blankToNull(place.getCourtNo());
        if (no == null) return;
        Long courtId = courtService.listingBaseOf(place.getCourt(), place.getDistrict()).getId();
        String building = blankToNull(place.getBuilding());

        judgeRepo.findByCourtIdAndCourtRoomNoIgnoreCaseAndActiveTrue(courtId, no).stream()
                .filter(j -> !j.getId().equals(ignoreId))
                .filter(j -> Objects.equals(lower(blankToNull(j.getBuilding())), lower(building)))
                .findFirst()
                .ifPresent(j -> {
                    throw new IllegalArgumentException("Court No. " + no + " ("
                            + seatLabel(place.getCourt(), place.getDistrict(), place.getBuilding(), null)
                            + ") already has a judge: " + j.getName()
                            + ". A court can have only one judge. Use \"Change judge\" on that listing instead");
                });
    }

    private static String lower(String v) {
        return v == null ? null : v.toLowerCase();
    }

    // Change the judge of a listing. The listing itself (court, building, court no., contacts, jurisdiction) stays as it is,
    // only its judge changes. The judge who sat there keeps the period up to the day before and the new judge starts on the
    // effective date, so successor courts and the history stay right. The judge who leaves is not deleted: if no listing holds
    // that judge any more, the judge simply shows as not holding a court in the Judges list.
    // When the incoming judge sits in another listing, leavingPlan says what happens to that court:
    // KEEP_BOTH (the judge holds both), SWAP (the judge being replaced takes it), REPLACE (another judge takes it)
    @Transactional
    public Judge changeJudge(Long listingId, JudgeChangeRequest req) {
        Judge listing = getActive(listingId);
        JudgeProfile outgoing = listing.getProfile();

        JudgeProfile incoming;
        if (req.isVacant()) {
            // The court has no judge from the effective date. It stays a listing, held by the special Vacant profile
            if (outgoing.isVacant()) throw new IllegalArgumentException("This court is already vacant");
            incoming = profileService.vacantProfile();
        } else if (req.getJudgeId() != null) {
            incoming = profileService.requireActive(req.getJudgeId());
        } else {
            String typed = blankToNull(req.getName());
            if (typed == null) throw new IllegalArgumentException("Choose a judge or enter the new judge's name");
            // The same judge as now: only the photo is replaced
            if (JudgeProfile.keyOf(typed).equals(outgoing.getNameKey())) {
                outgoing.setPhoto(profileService.cleanPhoto(req.getPhoto()));
                profileRepo.save(outgoing);
                syncDutyMagistrates(listing);
                return listing;
            }
            incoming = profileService.createOrRestore(typed, req.getPhoto());
        }

        if (incoming.getId().equals(outgoing.getId())) {
            throw new IllegalArgumentException(incoming.getName() + " is already the judge of this listing");
        }

        LocalDate effective = req.getEffectiveFrom() != null ? req.getEffectiveFrom() : LocalDate.now();
        String plan = req.isVacant() || blankToNull(req.getLeavingPlan()) == null ? "KEEP_BOTH" : req.getLeavingPlan().trim().toUpperCase();

        assignJudge(listing, incoming, effective);

        if (!plan.equals("KEEP_BOTH")) {
            if (req.getFromListingId() == null) throw new IllegalArgumentException("Choose the court the incoming judge is leaving");
            Judge leaving = getActive(req.getFromListingId());
            if (!leaving.getProfile().getId().equals(incoming.getId())) {
                throw new IllegalArgumentException(incoming.getName() + " does not hold that court");
            }
            switch (plan) {
                case "SWAP" -> assignJudge(leaving, outgoing, effective);
                case "REPLACE" -> {
                    if (req.getReplacementJudgeId() == null) throw new IllegalArgumentException("Choose the judge who takes the court being left");
                    assignJudge(leaving, profileService.requireActive(req.getReplacementJudgeId()), effective);
                }
                default -> throw new IllegalArgumentException("Unknown plan for the court being left");
            }
        }
        return listing;
    }

    // Gives a listing a different judge from the effective date and keeps the court history: the judge who sat there keeps
    // the period up to the day before, the new judge starts a new period on the effective date
    private void assignJudge(Judge listing, JudgeProfile newJudge, LocalDate effective) {
        JudgeProfile outgoing = listing.getProfile();
        if (outgoing.getId().equals(newJudge.getId())) return;

        // Periods saved before judges were separate carry no judge of their own: they belong to the judge who sits now
        List<JudgeCourtNoRecord> records = courtNoRepo.findByJudgeId(listing.getId());
        records.stream().filter(r -> r.getProfileId() == null).forEach(r -> r.setProfileId(outgoing.getId()));
        records.stream().filter(r -> blankToNull(r.getJudgeName()) == null).forEach(r -> r.setJudgeName(outgoing.getName()));

        Optional<JudgeCourtNoRecord> open = records.stream()
                .filter(r -> r.getTillDate() == null)
                .max(Comparator.comparing(JudgeCourtNoRecord::getFromDate));

        if (open.isPresent()) {
            JudgeCourtNoRecord current = open.get();
            if (effective.isBefore(current.getFromDate())) {
                throw new IllegalArgumentException("The new judge cannot start before " + current.getFromDate()
                        + ", the day the current period of this court began");
            }
            // The judge who sat here always keeps a period of their own, never overwritten by the successor:
            // up to the day before the change, or just that one day when the change is made on the day the period began
            current.setTillDate(effective.isAfter(current.getFromDate()) ? effective.minusDays(1) : current.getFromDate());
            courtNoRepo.save(current);
            courtNoRepo.save(successorPeriod(listing, current.getCourtRoomNo(), current.getBuilding(),
                    current.getCourt(), current.getDistrict(), effective, newJudge));
        } else if (blankToNull(listing.getCourtRoomNo()) != null) {
            // No period was ever recorded (the listing had no court number history): record the judge who leaves from the day
            // the listing was added, so they are not lost from the history, and start the successor
            LocalDate began = listing.getCreatedAt() != null ? listing.getCreatedAt().toLocalDate() : effective;
            if (began.isAfter(effective)) began = effective;
            courtNoRepo.save(JudgeCourtNoRecord.builder()
                    .judgeId(listing.getId())
                    .courtRoomNo(listing.getCourtRoomNo())
                    .fromDate(began)
                    .tillDate(effective.isAfter(began) ? effective.minusDays(1) : began)
                    .building(blankToNull(listing.getBuilding()))
                    .court(listing.getCourt())
                    .district(listing.getDistrict())
                    .judgeName(outgoing.getName())
                    .profileId(outgoing.getId())
                    .build());
            courtNoRepo.save(successorPeriod(listing, listing.getCourtRoomNo(), listing.getBuilding(),
                    listing.getCourt(), listing.getDistrict(), effective, newJudge));
        }
        courtNoRepo.saveAll(records);

        listing.setProfile(newJudge);
        listing.setUpdatedAt(LocalDateTime.now());
        judgeRepo.save(listing);
        // Roster rows that already ended keep the judge who sat then; only current and future ones follow the change.
        // A vacant court has no judge to copy into the roster, so those rows are left as they are
        if (!newJudge.isVacant()) syncDutyMagistrates(listing, effective, outgoing.getName());
    }

    // The open period of the judge who takes a court over
    private JudgeCourtNoRecord successorPeriod(Judge listing, String courtNo, String building, String court, String district,
                                               LocalDate from, JudgeProfile judge) {
        return JudgeCourtNoRecord.builder()
                .judgeId(listing.getId())
                .courtRoomNo(courtNo)
                .fromDate(from)
                .building(building)
                .court(court)
                .district(district)
                .judgeName(judge.getName())
                .profileId(judge.getId())
                .build();
    }

    // Remove a listing. Nothing is deleted: the listing is switched off, its open court number period is closed
    // and the whole history stays (it still shows under successor courts). The judge stays in the Judges list
    @Transactional
    public void delete(Long id) {
        Judge listing = getActive(id);

        LocalDate today = LocalDate.now();
        courtNoRepo.findByJudgeId(id).stream()
                .filter(r -> r.getTillDate() == null)
                .forEach(r -> {
                    r.setTillDate(today.isBefore(r.getFromDate()) ? r.getFromDate() : today);
                    if (r.getProfileId() == null) r.setProfileId(listing.getProfile().getId());
                    if (blankToNull(r.getJudgeName()) == null) r.setJudgeName(listing.getName());
                    courtNoRepo.save(r);
                });

        unlinkDutyMagistrates(listing);
        listing.setActive(false);
        listing.setArchivedAt(LocalDateTime.now());
        listing.setUpdatedAt(LocalDateTime.now());
        judgeRepo.save(listing);
    }

    // Duty magistrate rows copy the judge's details, so they are refreshed. Rows whose duty has ended keep what they
    // were saved with (the judge and court number of that time), so the past is never rewritten
    private void syncDutyMagistrates(Judge judge) {
        syncDutyMagistrates(judge, LocalDate.now(), judge.getName());
    }

    // Refreshes the rows of this listing whose duty runs on or after the date. Only rows saved for the judge named
    // `sat` are touched (rows of an earlier judge of the same court stay as they are)
    private void syncDutyMagistrates(Judge judge, LocalDate from, String sat) {
        List<DutyMagistrate> linked = dutyMagistrateRepo.findByJudgeId(judge.getId()).stream()
                .filter(d -> d.getTillDate() == null || Boolean.TRUE.equals(d.getFurtherOrder()) || !d.getTillDate().isBefore(from))
                .filter(d -> sat == null || d.getJudgeName() == null || d.getJudgeName().equalsIgnoreCase(sat))
                .toList();
        linked.forEach(d -> d.applyJudge(judge));
        dutyMagistrateRepo.saveAll(linked);
    }

    // Clears the judge link on roster rows
    private void unlinkDutyMagistrates(Judge judge) {
        List<DutyMagistrate> linked = dutyMagistrateRepo.findByJudgeId(judge.getId());
        linked.forEach(d -> d.setJudgeId(null));
        dutyMagistrateRepo.saveAll(linked);
    }

    // Copy and trim the text fields
    private void applyText(Judge judge, JudgeRequest req, Court place) {
        judge.setDesignation(req.getDesignation().trim());
        // Court, district, building and court no. are taken from the court table row, never from typed text
        judge.setCourt(place.getCourt());
        judge.setDistrict(place.getDistrict());
        judge.setCourtId(courtService.listingBaseOf(place.getCourt(), place.getDistrict()).getId());
        judge.setCourtRoomNo(blankToNull(place.getCourtNo()));
        judge.setBuilding(blankToNull(place.getBuilding()));
        judge.setVcMeetingId(blankToNull(req.getVcMeetingId()));
        judge.setCourtEmail(blankToNull(req.getCourtEmail()));
        judge.setVirtualCourtLink(blankToNull(req.getVirtualCourtLink()));
        judge.setCourtReaderName(blankToNull(req.getCourtReaderName()));
        judge.setCourtReaderMobile(blankToNull(req.getCourtReaderMobile()));
        judge.setJurisdiction(blankToNull(req.getJurisdiction()));
    }

    // Empty becomes null
    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}