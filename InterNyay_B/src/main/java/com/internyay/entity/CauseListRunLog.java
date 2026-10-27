package com.internyay.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

// One cause list run: who started it, which hearing date it was for and what it managed to do
@Entity
@Table(name = "cause_list_run_log")
@Getter @Setter @NoArgsConstructor
public class CauseListRunLog {

    // AUTO is the hourly scheduler (or a "Run now" from the admin page), MANUAL is the CAPTCHA relay an admin walks through
    public enum Origin { AUTO, MANUAL }

    // RUNNING: still going. SUCCESS: everything that could be looked up was saved.
    // PARTIAL: some court rooms are left (CAPTCHA not readable, not found, failed). NOTHING_TO_DO: no case needed a number.
    // FAILED: the run itself broke. ABANDONED: a manual run that was never finished
    public enum Status { RUNNING, SUCCESS, PARTIAL, NOTHING_TO_DO, FAILED, ABANDONED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // The hearing date the numbers were looked up for
    private LocalDate hearingDate;

    @Enumerated(EnumType.STRING)
    private Origin origin;

    // Short name of the trigger, for example "9 PM run" or "Run now"
    private String label;

    @Enumerated(EnumType.STRING)
    private Status status;

    // Delhi High Court and Supreme Court cases looked up in the published PDFs
    private int highCourtChecked;

    // District court rooms: found, handled, left for an admin (CAPTCHA could not be read), and failed
    private int districtRooms;
    private int districtDone;
    private int districtCaptcha;
    private int districtFailed;

    // Cause list numbers saved in total
    private int numbersSaved;

    private LocalDateTime startedAt = LocalDateTime.now();
    private LocalDateTime finishedAt;

    @Column(length = 500)
    private String summary;

    // Every line of the run, one per line
    @Column(columnDefinition = "TEXT")
    private String details;
}
