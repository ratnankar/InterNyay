package com.internyay.dto;

import java.time.LocalDate;

// One period of a court number (id is the history record, used to edit or delete it): which judge sat there, in which court, district and building
public record CourtNoLogDto(Long id, Long judgeId, String judgeName, String designation,
                            String court, String district, String building,
                            String courtRoomNo, LocalDate fromDate, LocalDate tillDate, boolean current) {
}
