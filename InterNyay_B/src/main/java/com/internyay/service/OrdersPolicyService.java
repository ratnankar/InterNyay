package com.internyay.service;

import com.internyay.entity.Case;
import com.internyay.entity.Court;
import com.internyay.repository.CourtRepository;
import com.internyay.util.CaseCatalog;
import com.internyay.util.CourtMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Optional;

// Decides whether the court publishes orders for a case. Mahila courts (marked by the admin on the court
// room) and family disputes do not declare orders, so nothing is fetched from eCourts for them
@Service
@RequiredArgsConstructor
public class OrdersPolicyService {

    private final CourtRepository courtRepo;
    private final CourtService courtService;

    // Whether orders are declared, and the reason when they are not
    public record Verdict(boolean declared, String reason) {
        static Verdict yes() { return new Verdict(true, null); }
        static Verdict no(String reason) { return new Verdict(false, reason); }
    }

    public Verdict forCase(Case c) {

        if (CaseCatalog.isFamilyDispute(c.getReliefSought())) {
            return Verdict.no("Orders are not declared in family dispute cases");
        }

        // Juvenile Justice Board cases have no CNR, so there is nothing to fetch from eCourts
        if (courtService.isJuvenileJusticeBoard(c)) {
            return Verdict.no("Orders are not fetched for a Juvenile Justice Board");
        }

        Court place = c.getCourtPlace();

        // Without a court no. there is no court room or judge to check
        if (place == null || CourtMatch.courtNo(c.getCourtNo()) == null) return Verdict.yes();

        Optional<Court> room = courtRepo
                .findByCourtAndDistrictAndMahilaCourtTrue(place.getCourt(), place.getDistrict()).stream()
                .filter(r -> CourtMatch.sameCourtNo(c.getCourtNo(), r.getCourtNo()))
                .findFirst();

        if (room.isPresent()) {
            return Verdict.no("Orders are not declared in a Mahila court");
        }

        return Verdict.yes();
    }
}
