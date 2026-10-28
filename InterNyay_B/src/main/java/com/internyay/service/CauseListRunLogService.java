package com.internyay.service;

import com.internyay.dto.CauseListRunDto;
import com.internyay.entity.CauseListRunLog;
import com.internyay.entity.CauseListRunLog.Origin;
import com.internyay.entity.CauseListRunLog.Status;
import com.internyay.repository.CauseListRunLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

// Keeps the record of cause list runs (automatic and manual) that Admin > Cause List shows
@Service
@RequiredArgsConstructor
@Slf4j
public class CauseListRunLogService {

    // A run that is still "running" after this long was cut off (for example by a restart)
    private static final int STALE_HOURS = 3;
    private static final int MAX_LINES = 400;
    private static final int MAX_LINE_LENGTH = 400;

    // What a run managed to do, saved on its log row when it ends
    public record Totals(int highCourtChecked, int districtRooms, int districtDone,
                         int districtCaptcha, int districtFailed, int numbersSaved) {
        public static final Totals NONE = new Totals(0, 0, 0, 0, 0, 0);
    }

    private final CauseListRunLogRepository repo;


    public CauseListRunLog begin(LocalDate hearingDate, Origin origin, String label) {
        CauseListRunLog row = new CauseListRunLog();
        row.setHearingDate(hearingDate);
        row.setOrigin(origin);
        row.setLabel(label);
        row.setStatus(Status.RUNNING);
        row.setStartedAt(LocalDateTime.now());
        return repo.save(row);
    }

    public void finish(Long id, Status status, Totals totals, String summary, List<String> lines) {
        if (id == null) return;

        repo.findById(id).ifPresent(row -> {
            row.setStatus(status);
            row.setHighCourtChecked(totals.highCourtChecked());
            row.setDistrictRooms(totals.districtRooms());
            row.setDistrictDone(totals.districtDone());
            row.setDistrictCaptcha(totals.districtCaptcha());
            row.setDistrictFailed(totals.districtFailed());
            row.setNumbersSaved(totals.numbersSaved());
            row.setFinishedAt(LocalDateTime.now());
            row.setSummary(cut(summary, 500));
            row.setDetails(join(lines));
            repo.save(row);
        });
    }

    // Progress of a manual run is saved as it goes, so a half-done run still shows what it did
    public void update(Long id, Totals totals, List<String> lines) {
        if (id == null) return;

        repo.findById(id).ifPresent(row -> {
            row.setHighCourtChecked(totals.highCourtChecked());
            row.setDistrictRooms(totals.districtRooms());
            row.setDistrictDone(totals.districtDone());
            row.setDistrictCaptcha(totals.districtCaptcha());
            row.setDistrictFailed(totals.districtFailed());
            row.setNumbersSaved(totals.numbersSaved());
            row.setDetails(join(lines));
            repo.save(row);
        });
    }

    @Transactional
    public List<CauseListRunDto> recent(int limit) {
        closeStale();
        return repo.findAllByOrderByStartedAtDesc(PageRequest.of(0, Math.max(1, Math.min(limit, 100))))
                .stream().map(CauseListRunDto::of).toList();
    }

    public Optional<CauseListRunDto> get(Long id) {
        return repo.findById(id).map(CauseListRunDto::of);
    }

    public Optional<CauseListRunDto> lastFinished() {
        return repo.findFirstByStatusNotOrderByStartedAtDesc(Status.RUNNING).map(CauseListRunDto::of);
    }

    // Runs that never reported back (the server restarted in the middle) are closed so they do not look active forever
    public void closeStale() {
        LocalDateTime limit = LocalDateTime.now().minusHours(STALE_HOURS);

        for (CauseListRunLog row : repo.findByStatusAndStartedAtBefore(Status.RUNNING, limit)) {
            row.setStatus(row.getOrigin() == Origin.MANUAL ? Status.ABANDONED : Status.FAILED);
            row.setFinishedAt(LocalDateTime.now());
            row.setSummary("The run never finished (the server restarted or the session was left open)");
            repo.save(row);
        }
    }

    private static String join(List<String> lines) {
        if (lines == null || lines.isEmpty()) return null;

        List<String> kept = lines.size() > MAX_LINES ? lines.subList(lines.size() - MAX_LINES, lines.size()) : lines;
        return String.join("\n", kept.stream().map(l -> cut(l.replace('\n', ' '), MAX_LINE_LENGTH)).toList());
    }

    private static String cut(String text, int max) {
        if (text == null) return null;
        return text.length() <= max ? text : text.substring(0, max - 1) + "…";
    }
}
