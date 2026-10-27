package com.internyay.dto;

import com.internyay.entity.CauseListRunLog;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;

// A cause list run as the admin page shows it
public record CauseListRunDto(
        Long id,
        LocalDate hearingDate,
        String origin,
        String label,
        String status,
        int highCourtChecked,
        int districtRooms,
        int districtDone,
        int districtCaptcha,
        int districtFailed,
        int numbersSaved,
        OffsetDateTime startedAt,
        OffsetDateTime finishedAt,
        String summary,
        List<String> lines) {

    public static CauseListRunDto of(CauseListRunLog r) {
        List<String> lines = r.getDetails() == null || r.getDetails().isBlank()
                ? List.of() : Arrays.asList(r.getDetails().split("\n"));

        return new CauseListRunDto(r.getId(), r.getHearingDate(), r.getOrigin().name(), r.getLabel(),
                r.getStatus().name(), r.getHighCourtChecked(), r.getDistrictRooms(), r.getDistrictDone(),
                r.getDistrictCaptcha(), r.getDistrictFailed(), r.getNumbersSaved(),
                withOffset(r.getStartedAt()), withOffset(r.getFinishedAt()), r.getSummary(), lines);
    }

    private static OffsetDateTime withOffset(LocalDateTime t) {
        return t == null ? null : t.atZone(ZoneId.systemDefault()).toOffsetDateTime();
    }
}
