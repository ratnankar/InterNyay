package com.internyay.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;

// Used by the admin to add or edit a listing (a court seat). Name and photo belong to the judge, not to the listing:
// a new listing is given a judge, either an existing one (judgeId) or a new one (newJudgeName and newJudgePhoto).
// Editing a listing never changes its judge, use "Change judge" for that
@Data
public class JudgeRequest {

    // Existing judge (judge profile id) who holds the new listing
    private Long judgeId;

    // New judge for the new listing, used when judgeId is empty
    private String newJudgeName;

    // New judge's photo as base64 text. Empty = no photo
    private String newJudgePhoto;

    @NotBlank(message = "Designation is required")
    private String designation;

    @NotBlank(message = "Court is required")
    private String court;

    // Optional. Without a district the court numbers stay as they are (none is moved into a district)
    private String district;

    private String courtRoomNo;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate courtNoFrom;

    // True when the court, district, building or court number is being corrected (it was saved wrongly):
    // the current period is replaced in place and the old value is not kept in the history
    private Boolean courtNoCorrection;

    private String building;
    private String floor;
    private String vcMeetingId;

    // Court email, can be empty
    @Pattern(
        regexp = "^$|^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
        message = "Enter a valid court email address"
    )
    private String courtEmail;

    // Virtual court link, must be http or https
    @Pattern(
        regexp = "^$|^https?://\\S+$",
        message = "Virtual court hearing link must start with http:// or https://"
    )
    private String virtualCourtLink;

    // Court reader contact
    private String courtReaderName;

    // Indian mobile number, with or without +91, can be empty
    @Pattern(
        regexp = "^$|^(\\+91[\\s-]?|0)?[6-9]\\d{9}$",
        message = "Enter a valid 10-digit Indian mobile number (optionally with +91)"
    )
    private String courtReaderPhone;

    private String jurisdiction;
}
