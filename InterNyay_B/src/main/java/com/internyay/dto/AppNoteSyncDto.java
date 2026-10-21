package com.internyay.dto;

import java.util.List;

// Notes changed since the app last asked, including deleted ones (deleted = true)
public record AppNoteSyncDto(List<AppNoteDto> notes) {
}
